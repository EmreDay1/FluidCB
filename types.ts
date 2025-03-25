/**
 * Basic types for PCB SVG Parser
 */

// Represents a trace from a PCB design
export interface Trace {
  id: string;          // Unique identifier
  pathData: string;    // SVG path data (d attribute)
  width: number;       // Stroke width
  stroke?: string;     // Stroke color
  fill?: string;       // Fill color (usually "none" for PCB traces)
  layer?: string;      // PCB layer identifier (F.Cu, B.Cu, etc.)
  transform?: string;  // Any SVG transform applied to the path
}

// Configuration options for the parser
export interface ParserOptions {
  verbose?: boolean;   // Whether to output detailed logs
}
