// Build-time imports that wrangler bundles (wrangler.toml [[rules]]): .html as a string, .png as bytes.
declare module '*.html' {
  const text: string;
  export default text;
}
declare module '*.png' {
  const bytes: ArrayBuffer;
  export default bytes;
}
