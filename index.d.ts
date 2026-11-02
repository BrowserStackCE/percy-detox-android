export interface PercyRegion {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PercyDetoxOptions {
  /** Device name shown in Percy. Default: Detox config `device.name`. */
  deviceName?: string;
  /** OS version shown in Percy. Default: Detox config `device.osVersion`. */
  osVersion?: string;
  /** Default: inferred from screenshot dimensions. */
  orientation?: 'portrait' | 'landscape' | 'auto';
  /** "auto" (default): device screenshot locally, root-element screenshot on android.cloud. */
  screenshotMode?: 'auto' | 'device' | 'element';
  /** testID of the view to capture in element mode. Default: Android DecorView. */
  rootTestID?: string;
  /** A Detox element to capture in element mode (overrides rootTestID). */
  rootElement?: Detox.NativeElement;
  statusBarHeight?: number;
  navigationBarHeight?: number;
  fullscreen?: boolean;
  /** Multiplier from element frame units to screenshot pixels. Android: 1, iOS: device pixel ratio. */
  scaleFactor?: number;
  ignoreRegionTestIDs?: string[];
  ignoreRegionElements?: Detox.NativeElement[];
  customIgnoreRegions?: PercyRegion[];
  considerRegionTestIDs?: string[];
  considerRegionElements?: Detox.NativeElement[];
  customConsiderRegions?: PercyRegion[];
  /** Wait for Percy comparison result and return it. */
  sync?: boolean;
  testCase?: string;
  labels?: string;
  externalDebugUrl?: string;
  /** Default true: Percy errors are logged and don't fail the test. */
  ignoreErrors?: boolean;
}

declare function percyScreenshot(name: string, options?: PercyDetoxOptions): Promise<any>;

declare namespace percyScreenshot {
  export { percyScreenshot };
  export function isPercyEnabled(): Promise<boolean>;
}

export = percyScreenshot;
