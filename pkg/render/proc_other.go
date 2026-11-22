//go:build unix && !linux

package render

import "syscall"

// sysProcAttr puts the child in a process group of its own, so that the terminal's Ctrl-C reaches only the server
// (which then stops the child) and stopping the child stops whatever it started.
func sysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setpgid: true}
}
