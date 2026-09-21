declare module "*/server.js" {
  export function handleRequest(request: Request): Promise<Response>;
  const server: { fetch(request: Request): Promise<Response> };
  export default server;
}
