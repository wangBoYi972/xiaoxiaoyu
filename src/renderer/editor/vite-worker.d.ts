/**
 * Vite 的 `?worker` 导入类型声明。
 * 本项目 tsconfig 没有引入 `vite/client`，所以这里自己补一份最小声明，
 * 避免为了一个类型引用去动共享的 tsconfig。
 */
declare module '*?worker' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}

declare module '*?worker&inline' {
  const workerConstructor: new () => Worker;
  export default workerConstructor;
}
