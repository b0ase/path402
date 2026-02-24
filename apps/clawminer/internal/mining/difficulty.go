package mining

import (
	"fmt"
	"log"
	"math/big"
	"strings"
	"sync"
	"time"
)

// DifficultyAdjuster implements Bitcoin-style difficulty adjustment for the $402 network.
//
// It tracks all blocks observed on the network (local + gossip) and adjusts
// the mining target to maintain a steady global block rate. When more miners
// join and blocks come faster, difficulty increases. When miners leave and
// blocks slow down, difficulty decreases.
//
// This forces miners to compete and scale up into large commercial operations
// that cannot hide — exactly like Bitcoin.
type DifficultyAdjuster struct {
	mu               sync.RWMutex
	target           *big.Int      // Current mining target (hash must be <= target)
	adjustmentPeriod int           // Blocks between difficulty adjustments
	targetBlockTime  time.Duration // Desired time between network-wide blocks
	blockTimestamps  []time.Time   // Block timestamps in current adjustment period
	totalBlocks      int64         // Total blocks observed since node start
	maxTarget        *big.Int      // Easiest possible target (floor)
	minTarget        *big.Int      // Hardest possible target (ceiling)
}

const (
	// maxTargetHex is the easiest possible target (~2 leading hex zeros).
	// Network difficulty can never drop below this.
	maxTargetHex = "00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"

	// minTargetHex is the hardest possible target (16 leading hex zeros).
	// Even massive mining farms won't push past this.
	minTargetHex = "0000000000000000ffffffffffffffffffffffffffffffffffffffffffffffff"

	// maxAdjustFactor caps how much difficulty can change in one period.
	// Bitcoin uses 4x — we match that.
	maxAdjustFactor = 4.0
)

// NewDifficultyAdjuster creates a new adjuster.
//
//   - initialDifficulty: starting difficulty as leading hex zeros (e.g., 3)
//   - adjustmentPeriod: blocks between adjustments (e.g., 144 = ~1 day at 10min blocks)
//   - targetBlockTime: desired time between blocks (e.g., 10 * time.Minute)
func NewDifficultyAdjuster(initialDifficulty, adjustmentPeriod int, targetBlockTime time.Duration) *DifficultyAdjuster {
	target := TargetFromDifficulty(initialDifficulty)

	maxT := new(big.Int)
	maxT.SetString(maxTargetHex, 16)

	minT := new(big.Int)
	minT.SetString(minTargetHex, 16)

	return &DifficultyAdjuster{
		target:           target,
		adjustmentPeriod: adjustmentPeriod,
		targetBlockTime:  targetBlockTime,
		blockTimestamps:  make([]time.Time, 0, adjustmentPeriod+1),
		maxTarget:        maxT,
		minTarget:        minT,
	}
}

// TargetFromDifficulty converts leading-hex-zeros difficulty to a 256-bit target.
// E.g., difficulty=3 → 0x000FFFFF...FFF (3 leading zeros, rest F).
func TargetFromDifficulty(difficulty int) *big.Int {
	if difficulty < 1 {
		difficulty = 1
	}
	if difficulty > 62 {
		difficulty = 62
	}
	h := strings.Repeat("0", difficulty) + strings.Repeat("f", 64-difficulty)
	t := new(big.Int)
	t.SetString(h, 16)
	return t
}

// DifficultyFromTarget returns the approximate leading-hex-zeros from a target.
func DifficultyFromTarget(target *big.Int) int {
	if target.Sign() <= 0 {
		return 64
	}
	h := fmt.Sprintf("%064x", target)
	count := 0
	for _, c := range h {
		if c == '0' {
			count++
		} else {
			break
		}
	}
	return count
}

// RecordBlock records a block observation from any source (local mining or gossip).
// This is the core input to the difficulty adjustment algorithm.
func (da *DifficultyAdjuster) RecordBlock(ts time.Time) {
	da.mu.Lock()
	defer da.mu.Unlock()

	da.blockTimestamps = append(da.blockTimestamps, ts)
	da.totalBlocks++

	if len(da.blockTimestamps) >= da.adjustmentPeriod {
		da.adjust()
	}
}

// adjust recalculates the mining target based on observed block rate.
// Bitcoin formula: new_target = old_target * (actual_time / expected_time)
// Clamped to max 4x change per period.
// Must be called with lock held.
func (da *DifficultyAdjuster) adjust() {
	n := len(da.blockTimestamps)
	if n < 2 {
		da.blockTimestamps = da.blockTimestamps[:0]
		return
	}

	actualTime := da.blockTimestamps[n-1].Sub(da.blockTimestamps[0])
	expectedTime := time.Duration(n-1) * da.targetBlockTime

	if actualTime <= 0 {
		actualTime = time.Second // prevent division by zero
	}

	// ratio = actual / expected
	// < 1.0 → blocks came too fast → decrease target (harder)
	// > 1.0 → blocks came too slow → increase target (easier)
	ratio := float64(actualTime) / float64(expectedTime)

	if ratio > maxAdjustFactor {
		ratio = maxAdjustFactor
	}
	if ratio < 1.0/maxAdjustFactor {
		ratio = 1.0 / maxAdjustFactor
	}

	// new_target = old_target * ratio
	// Using fixed-point: multiply by (ratio * 10000), divide by 10000
	scaledRatio := int64(ratio * 10000)
	if scaledRatio < 1 {
		scaledRatio = 1
	}

	newTarget := new(big.Int).Set(da.target)
	newTarget.Mul(newTarget, big.NewInt(scaledRatio))
	newTarget.Div(newTarget, big.NewInt(10000))

	// Clamp to bounds
	if newTarget.Cmp(da.maxTarget) > 0 {
		newTarget.Set(da.maxTarget)
	}
	if newTarget.Cmp(da.minTarget) < 0 {
		newTarget.Set(da.minTarget)
	}

	oldDiff := DifficultyFromTarget(da.target)
	newDiff := DifficultyFromTarget(newTarget)

	log.Printf("[difficulty] ADJUSTMENT: %d blocks in %v (expected %v). "+
		"Ratio: %.2fx. Difficulty: %d → %d",
		n, actualTime.Round(time.Second), expectedTime.Round(time.Second),
		ratio, oldDiff, newDiff)

	da.target = newTarget
	da.blockTimestamps = da.blockTimestamps[:0]
}

// Target returns the current mining target as a new big.Int (safe to modify).
func (da *DifficultyAdjuster) Target() *big.Int {
	da.mu.RLock()
	defer da.mu.RUnlock()
	return new(big.Int).Set(da.target)
}

// TargetHex returns the current target as a zero-padded 64-char hex string.
func (da *DifficultyAdjuster) TargetHex() string {
	da.mu.RLock()
	defer da.mu.RUnlock()
	return fmt.Sprintf("%064x", da.target)
}

// Difficulty returns the current approximate difficulty (leading hex zeros).
func (da *DifficultyAdjuster) Difficulty() int {
	da.mu.RLock()
	defer da.mu.RUnlock()
	return DifficultyFromTarget(da.target)
}

// CheckHash returns true if hash (hex string) meets the current target.
func (da *DifficultyAdjuster) CheckHash(hash string) bool {
	da.mu.RLock()
	defer da.mu.RUnlock()

	h := new(big.Int)
	h.SetString(hash, 16)
	return h.Cmp(da.target) <= 0
}

// Stats returns difficulty adjustment statistics for the API.
func (da *DifficultyAdjuster) Stats() map[string]interface{} {
	da.mu.RLock()
	defer da.mu.RUnlock()

	return map[string]interface{}{
		"difficulty":           DifficultyFromTarget(da.target),
		"target":              fmt.Sprintf("%064x", da.target),
		"adjustment_period":   da.adjustmentPeriod,
		"target_block_time_s": da.targetBlockTime.Seconds(),
		"blocks_until_adjust": da.adjustmentPeriod - len(da.blockTimestamps),
		"blocks_in_period":    len(da.blockTimestamps),
		"total_network_blocks": da.totalBlocks,
	}
}

// SetTarget allows restoring a previously persisted target (e.g., from DB on restart).
func (da *DifficultyAdjuster) SetTarget(target *big.Int) {
	da.mu.Lock()
	defer da.mu.Unlock()
	da.target = new(big.Int).Set(target)
}

// RestoreState rebuilds the adjustment window from historical block timestamps.
// Called on startup with the most recent block times from the database.
func (da *DifficultyAdjuster) RestoreState(target *big.Int, totalBlocks int64, recentTimestamps []time.Time) {
	da.mu.Lock()
	defer da.mu.Unlock()
	da.target = new(big.Int).Set(target)
	da.totalBlocks = totalBlocks
	if len(recentTimestamps) > da.adjustmentPeriod {
		recentTimestamps = recentTimestamps[len(recentTimestamps)-da.adjustmentPeriod:]
	}
	da.blockTimestamps = recentTimestamps
}
