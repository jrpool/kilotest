/*
  routePaths.ts
  Paths that the API interface is authorized to handle, by method, as glob-style
  patterns where * matches any sequence of characters.
*/

export const apiRoutePaths = {
  GET: ['/api/*'],
  POST: ['/api/*']
};
