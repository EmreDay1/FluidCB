import * as fs from 'fs';

/**
 * Basic types for PCB SVG Parser
 */

// Represents a trace from a PCB design
interface Trace {
  id: string;          // Unique identifier
  pathData: string;    // SVG path data (d attribute)
  width: number;       // Stroke width
  stroke?: string;     // Stroke color
  fill?: string;       // Fill color
  transform?: string;  // Any SVG transform
}

// Configuration options for the parser
interface ParserOptions {
  verbose?: boolean;   // Whether to output detailed logs
}

/**
 * Load SVG file from disk
 */
function loadSVG(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Error loading SVG file: ${filePath}`);
    console.error(error);
    process.exit(1);
    return ''; // Unreachable but satisfies TypeScript
  }
}

/**
 * Save SVG content to file
 */
function saveSVG(filePath: string, content: string): boolean {
  try {
    fs.writeFileSync(filePath, content);
    console.log(`SVG saved to: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`Error saving SVG file: ${filePath}`);
    console.error(error);
    return false;
  }
}

/**
 * Extract traces from SVG content
 */
function extractTraces(svgContent: string, options: ParserOptions = {}): Trace[] {
  const traces: Trace[] = [];
  const { verbose = false } = options;
  
  // Find all path elements using regex
  const pathRegex = /<path\s+([^>]*)>/g;
  const attrRegex = /(\w+)="([^"]*)"/g;
  
  let match: RegExpExecArray | null;
  let pathCount = 0;
  
  while ((match = pathRegex.exec(svgContent)) !== null) {
    pathCount++;
    const pathAttrs = match[1];
    const trace: Trace = {
      id: `trace-${pathCount}`,
      pathData: '',
      width: 1
    };
    
    // Extract attributes from the path element
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(pathAttrs)) !== null) {
      const [_, attrName, attrValue] = attrMatch;
      
      switch (attrName) {
        case 'd':
          trace.pathData = attrValue;
          break;
        case 'stroke-width':
          trace.width = parseFloat(attrValue);
          break;
        case 'id':
          trace.id = attrValue;
          break;
        case 'stroke':
          trace.stroke = attrValue;
          break;
        case 'fill':
          trace.fill = attrValue;
          break;
        case 'transform':
          trace.transform = attrValue;
          break;
      }
    }
    
    // Only add if we found path data
    if (trace.pathData) {
      if (verbose) {
        console.log(`Found trace: ${trace.id}, Width: ${trace.width}`);
      }
      traces.push(trace);
    }
  }
  
  return traces;
}

/**
 * Update SVG content with modified traces
 */
function updateSVGWithTraces(svgContent: string, traces: Trace[]): string {
  let updatedSVG = svgContent;
  
  // Replace each trace's path data in the SVG
  traces.forEach(trace => {
    const regex = new RegExp(`(<path[^>]*id="${trace.id}"[^>]*d=")[^"]*("[^>]*>)`, 'g');
    updatedSVG = updatedSVG.replace(regex, `$1${trace.pathData}$2`);
  });
  
  return updatedSVG;
}

/**
 * Process an SVG file
 */
function processSVG(
  inputFile: string, 
  outputFile?: string, 
  options: ParserOptions = {}
): { traces: Trace[], success: boolean } {
  // Load the SVG file
  console.log(`Loading SVG from: ${inputFile}`);
  const svgContent = loadSVG(inputFile);
  
  // Extract traces
  const traces = extractTraces(svgContent, options);
  console.log(`Found ${traces.length} traces in the SVG`);
  
  let success = true;
  
  // If outputFile is provided, save the SVG
  if (outputFile) {
    console.log(`Saving SVG to: ${outputFile}`);
    success = saveSVG(outputFile, svgContent);
  }
  
  return { traces, success };
}

/**
 * Main function
 */
function main(): void {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: ts-node pcb-parser.ts input.svg [output.svg] [--verbose]');
    console.log('  input.svg:  Path to input SVG file');
    console.log('  output.svg: Path to output SVG file (optional)');
    console.log('  --verbose:  Enable verbose logging');
    process.exit(1);
  }
  
  const inputFile = args[0];
  const verbose = args.includes('--verbose');
  
  // Determine if we have an output file (any argument that's not a flag)
  const outputFile = args.length > 1 && !args[1].startsWith('--') ? args[1] : undefined;
  
  const options: ParserOptions = { verbose };
  
  const { traces, success } = processSVG(inputFile, outputFile, options);
  
  // Use the traces variable to avoid the "declared but not used" warning
  console.log(`Processed ${traces.length} traces`);
  
  if (success) {
    console.log('SVG processing completed successfully!');
  } else {
    console.error('SVG processing failed.');
    process.exit(1);
  }
}

// If this file is run directly (not imported), execute main function
if (require.main === module) {
  main();
}
