declare module 'postcss-px-to-viewport' {
  interface PxToViewportOptions {
    viewportWidth?: number | ((file: string) => number)
    viewportHeight?: number
    unitPrecision?: number
    viewportUnit?: string
    fontViewportUnit?: string
    selectorBlackList?: (string | RegExp)[]
    propList?: (string | RegExp)[]
    minPixelValue?: number
    mediaQuery?: boolean
    exclude?: (string | RegExp)[]
    include?: (string | RegExp)[]
    landscape?: boolean
    landscapeUnit?: string
    landscapeWidth?: number
  }

  function plugin(options?: PxToViewportOptions): import('postcss').Plugin
  export default plugin
}
