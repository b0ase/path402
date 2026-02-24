//go:build android

package anet

import (
	"bufio"
	"encoding/hex"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	sysClassNet = "/sys/class/net"
	procIfInet6 = "/proc/net/if_inet6"
	procRoute   = "/proc/net/route"
	procFibTrie = "/proc/net/fib_trie"
)

// Interfaces enumerates network interfaces by reading /sys/class/net.
// On Android, net.Interfaces() fails with "netlinkrib: permission denied"
// because regular apps cannot open netlink sockets.
func Interfaces() ([]net.Interface, error) {
	entries, err := os.ReadDir(sysClassNet)
	if err != nil {
		return nil, err
	}

	var ifaces []net.Interface
	for _, e := range entries {
		name := e.Name()
		iface := net.Interface{Name: name}

		if data, err := os.ReadFile(filepath.Join(sysClassNet, name, "ifindex")); err == nil {
			if idx, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil {
				iface.Index = idx
			}
		}

		if data, err := os.ReadFile(filepath.Join(sysClassNet, name, "mtu")); err == nil {
			if mtu, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil {
				iface.MTU = mtu
			}
		}

		if data, err := os.ReadFile(filepath.Join(sysClassNet, name, "address")); err == nil {
			addr := strings.TrimSpace(string(data))
			if hw, err := net.ParseMAC(addr); err == nil {
				iface.HardwareAddr = hw
			}
		}

		if data, err := os.ReadFile(filepath.Join(sysClassNet, name, "flags")); err == nil {
			flagStr := strings.TrimSpace(string(data))
			if strings.HasPrefix(flagStr, "0x") {
				if flags, err := strconv.ParseUint(flagStr[2:], 16, 32); err == nil {
					iface.Flags = sysToNetFlags(uint32(flags))
				}
			}
		}

		ifaces = append(ifaces, iface)
	}

	return ifaces, nil
}

// InterfaceAddrs returns all unicast addresses from all interfaces.
func InterfaceAddrs() ([]net.Addr, error) {
	ifaces, err := Interfaces()
	if err != nil {
		return nil, err
	}

	var addrs []net.Addr
	for i := range ifaces {
		ifAddrs, err := InterfaceAddrsByInterface(&ifaces[i])
		if err != nil {
			continue
		}
		addrs = append(addrs, ifAddrs...)
	}
	return addrs, nil
}

// InterfaceAddrsByInterface returns addresses for a specific interface.
// IPv6 from /proc/net/if_inet6, IPv4 via /proc/net/route + /proc/net/fib_trie.
func InterfaceAddrsByInterface(ifi *net.Interface) ([]net.Addr, error) {
	var addrs []net.Addr

	// IPv6 addresses from /proc/net/if_inet6
	// Format per line: addr ifindex prefix_len scope flags ifname
	if f, err := os.Open(procIfInet6); err == nil {
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			fields := strings.Fields(scanner.Text())
			if len(fields) < 6 || fields[5] != ifi.Name {
				continue
			}
			if len(fields[0]) != 32 {
				continue
			}
			ipBytes, err := hex.DecodeString(fields[0])
			if err != nil || len(ipBytes) != 16 {
				continue
			}
			prefixLen, _ := strconv.Atoi(fields[2])
			addrs = append(addrs, &net.IPNet{
				IP:   net.IP(ipBytes),
				Mask: net.CIDRMask(prefixLen, 128),
			})
		}
		f.Close()
	}

	// IPv4 addresses: cross-reference /proc/net/route with /proc/net/fib_trie
	addrs = append(addrs, ipv4AddrsForInterface(ifi.Name)...)

	return addrs, nil
}

// route holds a parsed entry from /proc/net/route.
type route struct {
	ifName string
	dest   net.IP   // network address
	mask   net.IPMask
}

// readRoutes parses /proc/net/route.
// Format: Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT
// Destination and Mask are 8-char little-endian hex.
func readRoutes() []route {
	f, err := os.Open(procRoute)
	if err != nil {
		return nil
	}
	defer f.Close()

	var routes []route
	scanner := bufio.NewScanner(f)
	scanner.Scan() // skip header
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 8 {
			continue
		}
		dest := parseHexIPv4(fields[1])
		mask := parseHexIPv4(fields[7])
		if dest == nil || mask == nil {
			continue
		}
		routes = append(routes, route{
			ifName: fields[0],
			dest:   dest,
			mask:   net.IPMask(mask),
		})
	}
	return routes
}

// readFibTrieLocals extracts all LOCAL IPv4 addresses from /proc/net/fib_trie.
// LOCAL entries appear as "/32 host LOCAL" after an IP line like "|-- 192.168.1.105".
func readFibTrieLocals() []net.IP {
	f, err := os.Open(procFibTrie)
	if err != nil {
		return nil
	}
	defer f.Close()

	var locals []net.IP
	var lastIP string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		if strings.HasPrefix(line, "|--") || strings.HasPrefix(line, "+--") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				lastIP = parts[1]
			}
			continue
		}

		if strings.Contains(line, "/32 host LOCAL") && lastIP != "" {
			ip := net.ParseIP(lastIP)
			if ip != nil {
				locals = append(locals, ip.To4())
			}
		}
	}
	return locals
}

// ipv4AddrsForInterface returns the IPv4 addresses for a named interface.
// It reads the routing table to find which subnets belong to the interface,
// then matches LOCAL addresses from fib_trie to those subnets.
func ipv4AddrsForInterface(ifname string) []net.Addr {
	routes := readRoutes()
	locals := readFibTrieLocals()

	var addrs []net.Addr
	for _, local := range locals {
		for _, r := range routes {
			if r.ifName != ifname {
				continue
			}
			// Check if this LOCAL IP falls within this route's subnet
			network := &net.IPNet{IP: r.dest, Mask: r.mask}
			if network.Contains(local) {
				// Use the route's mask as the prefix length
				ones, _ := r.mask.Size()
				addrs = append(addrs, &net.IPNet{
					IP:   local,
					Mask: net.CIDRMask(ones, 32),
				})
				break
			}
		}
	}

	// Loopback special case: if interface is "lo" and we have 127.0.0.1
	if ifname == "lo" && len(addrs) == 0 {
		for _, local := range locals {
			if local.IsLoopback() {
				addrs = append(addrs, &net.IPNet{
					IP:   local,
					Mask: net.CIDRMask(8, 32),
				})
			}
		}
	}

	return addrs
}

// parseHexIPv4 converts an 8-char little-endian hex string to an IP.
// e.g. "0001A8C0" → 192.168.1.0
func parseHexIPv4(s string) net.IP {
	if len(s) != 8 {
		return nil
	}
	b, err := hex.DecodeString(s)
	if err != nil || len(b) != 4 {
		return nil
	}
	// /proc/net/route uses little-endian
	return net.IPv4(b[3], b[2], b[1], b[0])
}

// sysToNetFlags converts Linux sysfs interface flags to net.Flags.
func sysToNetFlags(raw uint32) net.Flags {
	var flags net.Flags
	if raw&0x1 != 0 { // IFF_UP
		flags |= net.FlagUp
	}
	if raw&0x2 != 0 { // IFF_BROADCAST
		flags |= net.FlagBroadcast
	}
	if raw&0x8 != 0 { // IFF_LOOPBACK
		flags |= net.FlagLoopback
	}
	if raw&0x10 != 0 { // IFF_POINTOPOINT
		flags |= net.FlagPointToPoint
	}
	if raw&0x1000 != 0 { // IFF_MULTICAST
		flags |= net.FlagMulticast
	}
	return flags
}
