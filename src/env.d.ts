/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module 'fft.js' {
  export default class FFT {
    constructor(size: number);
    readonly size: number;
    createComplexArray(): Float64Array;
    realTransform(out: Float64Array, data: ArrayLike<number>): void;
    inverseTransform(out: Float64Array, data: ArrayLike<number>): void;
    transform(out: Float64Array, data: ArrayLike<number>): void;
    completeSpectrum(spectrum: Float64Array): void;
    fromComplexArray(arr: Float64Array, out?: Float64Array): Float64Array;
    toComplexArray(arr: ArrayLike<number>, out?: Float64Array): Float64Array;
  }
}
