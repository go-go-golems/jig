// MessagePort helpers that work on a browser MessagePort and a Node worker_threads MessagePort alike.
// Both carry transferred ports inside the message value when they are listed in the transfer list, so the protocol
// puts ports in the data ({ t: 'eval', port }) rather than relying on event.ports, which Node does not have.

/** Call fn(data) for every message on port; returns a function that stops listening. */
export function listen(port, fn) {
  if (typeof port.on === 'function' && typeof port.off === 'function') {   // Node: data arrives as is
    const h = data => fn(data);
    port.on('message', h);
    return () => port.off('message', h);
  }
  const h = e => fn(e.data);
  port.addEventListener('message', h);
  port.start?.();
  return () => port.removeEventListener('message', h);
}

export function closePort(port) { try { port.close(); } catch { /* closed */ } }
