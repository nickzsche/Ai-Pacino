// Stub for react-devtools-core.
// Ink dynamically imports this only when DEV=true. In production builds
// this stub is bundled in its place so bun build --compile resolves cleanly.
const devtools = { connectToDevTools: () => {} }
export default devtools
