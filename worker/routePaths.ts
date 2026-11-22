/*
  routePaths.ts
  Paths that the Testaro worker interface is authorized to handle, by method, as
  glob-style patterns where * matches any sequence of characters.
*/

export const workerRoutePaths = {
  POST: ['/worker/job', '/worker/report']
};
