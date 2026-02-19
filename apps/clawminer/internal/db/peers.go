package db

import "time"

type Peer struct {
	PeerID            string  `json:"peer_id"`
	Host              string  `json:"host"`
	Port              int     `json:"port"`
	Status            string  `json:"status"`
	LastSeenAt        *int64  `json:"last_seen_at"`
	ReputationScore   int     `json:"reputation_score"`
	ValidMessages     int     `json:"valid_messages"`
	InvalidMessages   int     `json:"invalid_messages"`
	TokensAnnounced   *string `json:"tokens_announced"`
	DiscoveredVia     *string `json:"discovered_via"`
	ConnectionFailures int    `json:"connection_failures"`
}

func UpsertPeer(p *Peer) error {
	now := time.Now().Unix()
	_, err := db.Exec(`
		INSERT INTO peers (peer_id, host, port, status, last_seen_at, discovered_via)
		VALUES (?, ?, ?, 'active', ?, ?)
		ON CONFLICT(peer_id) DO UPDATE SET
			host = excluded.host,
			port = excluded.port,
			status = 'active',
			last_seen_at = excluded.last_seen_at`,
		p.PeerID, p.Host, p.Port, now, p.DiscoveredVia)
	return err
}

func GetActivePeers() ([]Peer, error) {
	rows, err := db.Query(`
		SELECT peer_id, host, port, status, last_seen_at, reputation_score,
			valid_messages, invalid_messages, connection_failures
		FROM peers
		WHERE status = 'active'
		ORDER BY reputation_score DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var peers []Peer
	for rows.Next() {
		var p Peer
		if err := rows.Scan(&p.PeerID, &p.Host, &p.Port, &p.Status, &p.LastSeenAt,
			&p.ReputationScore, &p.ValidMessages, &p.InvalidMessages, &p.ConnectionFailures); err != nil {
			return nil, err
		}
		peers = append(peers, p)
	}
	return peers, nil
}

func UpdateReputation(peerID string, delta int) error {
	col := "valid_messages"
	if delta < 0 {
		col = "invalid_messages"
	}
	_, err := db.Exec(`
		UPDATE peers SET
			reputation_score = MAX(0, MIN(100, reputation_score + ?)),
			`+col+` = `+col+` + 1
		WHERE peer_id = ?`, delta, peerID)
	return err
}
