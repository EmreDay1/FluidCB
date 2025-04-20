import * as fs from 'fs';
import { Trace, ParserOptions,Point, PathCommand, Junction } from './types'; 
import { extractTraces, processSVG } from './svg-parser';



/**
 * Parse SVG path commands from path data string
 */
function parsePathCommands(pathData: string): PathCommand[] {
  const commands: PathCommand[] = [];
  // Regex to match path commands and their parameters
  const commandRegex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
  
  let match: RegExpExecArray | null;
  
  // Parse each command in the path data
  while ((match = commandRegex.exec(pathData)) !== null) {
    const [_, commandType, paramsStr] = match;
    const isRelative = commandType.toLowerCase() === commandType;
    const params = paramsStr.trim().split(/[\s,]+/).filter(p => p).map(parseFloat);
    
    // Initialize command with empty points array
    const command: PathCommand = {
      type: commandType,
      points: [],
      isRelative
    };
    
    // Process different command types
    switch (commandType.toUpperCase()) {
      case 'M': // MoveTo
      case 'L': // LineTo
        for (let i = 0; i < params.length; i += 2) {
          if (i + 1 < params.length) {
            command.points.push({ x: params[i], y: params[i + 1] });
          }
        }
        break;
      
      case 'H': // Horizontal LineTo
        for (let i = 0; i < params.length; i++) {
          command.points.push({ x: params[i], y: 0 }); // Y will be set later
        }
        break;
      
      case 'V': // Vertical LineTo
        for (let i = 0; i < params.length; i++) {
          command.points.push({ x: 0, y: params[i] }); // X will be set later
        }
        break;
      
      case 'Z': // ClosePath
        command.points = [];
        break;
    }
    
    commands.push(command);
  }
  
  return commands;
}

/**
 * Convert path commands to absolute coordinates
 */
function convertToAbsoluteCoordinates(commands: PathCommand[]): PathCommand[] {
  let currentX = 0;
  let currentY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;
  
  return commands.map((cmd, index) => {
    const result: PathCommand = {
      type: cmd.type,
      points: [],
      isRelative: false
    };
    
    // Convert based on command type
    switch (cmd.type.toUpperCase()) {
      case 'M': // MoveTo
        for (let i = 0; i < cmd.points.length; i++) {
          const point = cmd.points[i];
          const x = cmd.isRelative ? currentX + point.x : point.x;
          const y = cmd.isRelative ? currentY + point.y : point.y;
          
          result.points.push({ x, y });
          
          currentX = x;
          currentY = y;
          
          // First point of M command sets the start of a subpath
          if (i === 0) {
            subpathStartX = currentX;
            subpathStartY = currentY;
          }
        }
        break;
      
      case 'L': // LineTo
        for (const point of cmd.points) {
          const x = cmd.isRelative ? currentX + point.x : point.x;
          const y = cmd.isRelative ? currentY + point.y : point.y;
          
          result.points.push({ x, y });
          
          currentX = x;
          currentY = y;
        }
        break;
      
      case 'H': // Horizontal LineTo
        for (const point of cmd.points) {
          const x = cmd.isRelative ? currentX + point.x : point.x;
          
          result.points.push({ x, y: currentY });
          
          currentX = x;
        }
        break;
      
      case 'V': // Vertical LineTo
        for (const point of cmd.points) {
          const y = cmd.isRelative ? currentY + point.y : point.y;
          
          result.points.push({ x: currentX, y });
          
          currentY = y;
        }
        break;
      
      case 'Z': // ClosePath
        result.points.push({ x: subpathStartX, y: subpathStartY });
        currentX = subpathStartX;
        currentY = subpathStartY;
        break;
    }
    
    return result;
  });
}

/**
 * Extract all points from commands
 */
function getPointsFromCommands(commands: PathCommand[]): Point[] {
  let points: Point[] = [];
  
  // Extract points from each command
  for (const cmd of commands) {
    points = points.concat(cmd.points);
  }
  
  return points;
}

/**
 * Analyze a single trace
 */
function analyzeTrace(trace: Trace): Trace & {
  commands?: PathCommand[];
  points?: Point[];
  startPoint?: Point;
  endPoint?: Point;
  connectedTraces?: string[];
  direction?: string;
} {
  const commands = parsePathCommands(trace.pathData);
  const absoluteCommands = convertToAbsoluteCoordinates(commands);
  const points = getPointsFromCommands(absoluteCommands);
  
  const analyzedTrace = {
    ...trace,
    commands: absoluteCommands,
    points: points,
    startPoint: points.length > 0 ? points[0] : undefined,
    endPoint: points.length > 0 ? points[points.length - 1] : undefined,
    connectedTraces: [] as string[],
    direction: 'unknown' as string
  };
  
  // Determine primary direction if we have enough points
  if (points.length >= 2) {
    const start = analyzedTrace.startPoint!;
    const end = analyzedTrace.endPoint!;
    
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    
    if (dx > dy * 2) {
      analyzedTrace.direction = 'horizontal';
    } else if (dy > dx * 2) {
      analyzedTrace.direction = 'vertical';
    } else {
      analyzedTrace.direction = 'diagonal';
    }
  }
  
  return analyzedTrace;
}

/**
 * Find junctions between traces
 */
function findJunctions(analyzedTraces: Array<Trace & {
  startPoint?: Point;
  endPoint?: Point;
}>, options: ParserOptions & { minJunctionDistance?: number } = {}): Junction[] {
  const junctions: Junction[] = [];
  const minDistance = options.minJunctionDistance || 0.1; // Default small distance
  
  // Create a map of points to trace IDs
  const pointMap: Map<string, string[]> = new Map();
  
  // Add each trace's start and end points to the map
  analyzedTraces.forEach(trace => {
    if (trace.startPoint) {
      // Round coordinates to handle floating point precision
      const startKey = `${Math.round(trace.startPoint.x / minDistance)},${Math.round(trace.startPoint.y / minDistance)}`;
      if (!pointMap.has(startKey)) {
        pointMap.set(startKey, []);
      }
      pointMap.get(startKey)!.push(trace.id);
    }
    
    if (trace.endPoint) {
      const endKey = `${Math.round(trace.endPoint.x / minDistance)},${Math.round(trace.endPoint.y / minDistance)}`;
      if (!pointMap.has(endKey)) {
        pointMap.set(endKey, []);
      }
      pointMap.get(endKey)!.push(trace.id);
    }
  });
  
  // Find points where multiple traces connect
  pointMap.forEach((traceIds, key) => {
    if (traceIds.length > 1) {
      const [x, y] = key.split(',').map(n => parseFloat(n) * minDistance);
      junctions.push({
        point: { x, y },
        traceIds: [...new Set(traceIds)] // Remove duplicates
      });
    }
  });
  
  return junctions;
}

/**
 * Update traces with connectivity information
 */
function updateTraceConnectivity(analyzedTraces: Array<Trace & {
  connectedTraces?: string[];
}>, junctions: Junction[]): void {
  // Initialize connectedTraces array for each trace if it doesn't exist
  analyzedTraces.forEach(trace => {
    if (!trace.connectedTraces) {
      trace.connectedTraces = [];
    }
  });
  
  // Update connectivity based on junctions
  junctions.forEach(junction => {
    junction.traceIds.forEach(id1 => {
      junction.traceIds.forEach(id2 => {
        if (id1 !== id2) {
          const trace = analyzedTraces.find(t => t.id === id1);
          if (trace && trace.connectedTraces && !trace.connectedTraces.includes(id2)) {
            trace.connectedTraces.push(id2);
          }
        }
      });
    });
  });
}

/**
 * Analyze all traces in an SVG file
 */
function analyzeTracesInSVG(
  svgContent: string,
  options: ParserOptions & { minJunctionDistance?: number } = {}
): {
  traces: Array<Trace & {
    commands?: PathCommand[];
    points?: Point[];
    startPoint?: Point;
    endPoint?: Point;
    connectedTraces?: string[];
    direction?: string;
  }>,
  junctions: Junction[]
} {
  // Extract traces using the original parser
  const rawTraces = extractTraces(svgContent, options);
  
  // Analyze each trace
  const analyzedTraces = rawTraces.map(trace => analyzeTrace(trace));
  
  // Find junctions between traces
  const junctions = findJunctions(analyzedTraces, options);
  
  // Update trace connectivity
  updateTraceConnectivity(analyzedTraces, junctions);
  
  if (options.verbose) {
    console.log(`Found ${junctions.length} junctions between traces`);
    junctions.forEach((junction, i) => {
      console.log(`Junction ${i+1}: connects traces [${junction.traceIds.join(', ')}]`);
    });
    
    analyzedTraces.forEach(trace => {
      if (trace.connectedTraces && trace.connectedTraces.length > 0) {
        console.log(`Trace ${trace.id} connects to: [${trace.connectedTraces.join(', ')}]`);
      }
      if (trace.direction) {
        console.log(`Trace ${trace.id} primary direction: ${trace.direction}`);
      }
    });
  }
  
  return { traces: analyzedTraces, junctions };
}

// Main function for CLI usage
function main(): void {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: ts-node trace-analyzer.ts input.svg [--verbose]');
    console.log('  input.svg:  Path to input SVG file');
    console.log('  --verbose:  Enable verbose logging');
    process.exit(1);
  }
  
  const inputFile = args[0];
  const verbose = args.includes('--verbose');
  
  const options: ParserOptions & { minJunctionDistance?: number } = { 
    verbose,
    minJunctionDistance: 0.1
  };
  
  // Load SVG content
  const svgContent = fs.readFileSync(inputFile, 'utf8');
  
  // Analyze traces
  const { traces, junctions } = analyzeTracesInSVG(svgContent, options);
  
  console.log(`Analyzed ${traces.length} traces and found ${junctions.length} junctions`);
  
  // Output an example of the analyzed data
  if (traces.length > 0) {
    const sampleTrace = traces[0];
    console.log('\nSample trace analysis:');
    console.log(`ID: ${sampleTrace.id}`);
    console.log(`Width: ${sampleTrace.width}`);
    console.log(`Direction: ${sampleTrace.direction}`);
    console.log(`Number of points: ${sampleTrace.points?.length}`);
    console.log(`Connected to: ${sampleTrace.connectedTraces?.join(', ') || 'none'}`);
  }
}

// Export functions for use in other modules
export {
  parsePathCommands,
  convertToAbsoluteCoordinates,
  analyzeTrace,
  findJunctions,
  updateTraceConnectivity,
  analyzeTracesInSVG
};

// If this file is run directly (not imported), execute main function
if (require.main === module) {
  main();
}
