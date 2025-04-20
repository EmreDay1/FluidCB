/**
 * Basic types for PCB SVG Parser
 */

// Represents a point in 2D space
export interface Point {
  x: number;
  y: number;
}

// Represents a command in an SVG path
export interface PathCommand {
  type: string;        // Command type (M, L, H, V, C, Q, Z, etc.)
  points: Point[];     // Points associated with this command
  isRelative: boolean; // Whether the command uses relative coordinates
}

// Represents a trace from a PCB design
export interface Trace {
  id: string;             // Unique identifier
  pathData: string;       // SVG path data (d attribute)
  width: number;          // Stroke width
  stroke?: string;        // Stroke color
  fill?: string;          // Fill color (usually "none" for PCB traces)
  layer?: string;         // PCB layer identifier (F.Cu, B.Cu, etc.)
  transform?: string;     // Any SVG transform applied to the path
  
  // Phase 2 additions - will be populated by analysis functions
  commands?: PathCommand[]; // Parsed commands from path data
  points?: Point[];       // All points along the trace
  startPoint?: Point;     // Starting point of the trace
  endPoint?: Point;       // Ending point of the trace
  connectedTraces?: string[]; // IDs of traces connected to this one
  direction?: string;     // Primary direction (horizontal, vertical, diagonal)
}

// Represents a junction where traces connect
export interface Junction {
  point: Point;           // Coordinates of the junction
  traceIds: string[];     // IDs of traces that connect at this junction
}

// Configuration options for the parser
export interface ParserOptions {
  verbose?: boolean;      // Whether to output detailed logs
  minJunctionDistance?: number; // Minimum distance to consider points as same junction
}
