/** Pure. Checkmark iff supported. */
export function routingIndicator(supported: boolean): '✓' | '✗' {
  return supported ? '✓' : '✗';
}
