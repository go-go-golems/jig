//go:build unix

package render

import "syscall"

// signalGroup signals the child's process group (its id is the child's pid; see sysProcAttr). It fails with
// ESRCH once nothing in the group is left.
func signalGroup(pid int, sig syscall.Signal) error {
	if pid <= 0 {
		return syscall.ESRCH
	}
	return syscall.Kill(-pid, sig)
}
