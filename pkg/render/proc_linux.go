package render

import "syscall"

// sysProcAttr puts the child in a process group of its own, so that the terminal's Ctrl-C reaches only the server
// (which then stops the child) and stopping the child stops whatever it started. Pdeathsig kills the child if the
// server dies without stopping it. (Linux sends it when the thread that started the child exits; Go keeps its
// threads unless a goroutine exits while locked to one, and a child killed that way is restarted.)
func sysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setpgid: true, Pdeathsig: syscall.SIGKILL}
}
