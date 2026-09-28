/** Types for the Scry Capture Format (SCF) 1.0. See ../../../spec/scf-1.0.md. */

export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  /** The capture id this problem belongs to, when known. */
  id?: string;
  /** The bundle-relative path this problem belongs to, when known. */
  path?: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  manifest: ScfManifest | null;
}

export interface DeviceRef {
  name?: string;
  os?: string;
  [key: string]: unknown;
}

export type CaptureMethod =
  | 'browser'
  | 'simulator'
  | 'emulator'
  | 'device'
  | 'jvm-render'
  | 'headless-render'
  | 'design-export'
  | 'manual';

export type CaptureCrop = 'root' | 'viewport' | 'fullpage' | 'element' | 'none';

export interface CaptureBlock {
  method?: CaptureMethod;
  device?: DeviceRef;
  viewport?: { width: number; height: number };
  scale?: number;
  size?: { width: number; height: number };
  crop?: CaptureCrop;
  [key: string]: unknown;
}

export interface ScfSource {
  kind: string;
  platform?: string;
  framework?: string;
  tool?: { name?: string; version?: string };
  [key: string]: unknown;
}

export interface ScfRepository {
  url?: string;
  commit?: string;
  branch?: string;
}

export type SkipReason = 'error' | 'timeout' | 'filtered' | 'unsupported' | 'empty';

export interface ScfCounts {
  declared?: number;
  captured?: number;
  skipped?: Array<{ id: string; reason: SkipReason; detail?: string }>;
}

export type CaptureKind = 'component' | 'screen' | 'page' | 'flow-step' | 'region' | 'doc-image';

export interface CaptureCode {
  file?: string;
  line?: number;
  component?: string;
  componentFile?: string;
}

export interface CaptureVariant {
  theme?: string;
  locale?: string;
  fontScale?: number;
  viewport?: { width: number; height: number };
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CaptureLinks {
  live?: string | null;
  page?: string | null;
  figma?: string | null;
}

export interface CaptureFlow {
  id?: string;
  name?: string;
  step?: number;
  order?: number;
}

export type StructureOrigin =
  | 'dom'
  | 'rn-fiber'
  | 'compose-semantics'
  | 'uiautomator'
  | 'xcui-accessibility'
  | 'flutter-widgets'
  | string;

export interface CaptureStructure {
  file: string;
  origin?: StructureOrigin;
  format: 'scf-tree/1';
}

export interface CaptureSourceText {
  file: string;
  path?: string;
}

export interface ScfCapture {
  id: string;
  image: string;
  kind?: CaptureKind;
  title?: string[] | string;
  name?: string;
  code?: CaptureCode;
  variant?: CaptureVariant;
  capture?: CaptureBlock;
  links?: CaptureLinks;
  flow?: CaptureFlow | null;
  structure?: CaptureStructure | null;
  sourceText?: CaptureSourceText | null;
  tags?: string[];
  [key: string]: unknown;
}

export interface ScfManifest {
  $schema?: string;
  scf: string;
  source: ScfSource;
  repository?: ScfRepository;
  createdAt?: string;
  defaults?: { capture?: CaptureBlock; [key: string]: unknown };
  counts?: ScfCounts;
  captures: ScfCapture[] | 'sidecars';
  [key: string]: unknown;
}

/** A bundle as an in-memory map of bundle-relative POSIX path -> file bytes. */
export type BundleFiles = Map<string, Uint8Array>;

/** scf-tree/1, see ../../../spec/scf-1.0.md. */
export interface ScfTreeNode {
  type: string;
  role?: string;
  testId?: string;
  text?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  style?: Record<string, unknown>;
  sourceRef?: { file?: string; line?: number };
  children?: ScfTreeNode[];
}

export interface ScfTree {
  format: 'scf-tree/1';
  units?: 'pt';
  root: ScfTreeNode;
}
