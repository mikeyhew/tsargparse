# TSArgParse

A TypeScript library for parsing command-line arguments.

## Features

- **Type Safety**: Designed so that TypeScript will infer the types of your arguments
- Support positional arguments, short and long options, and boolean flag options
- Outputs decent error messages and usage information on error
- Can define custom parsing logic to parse into arbitrary types

## Usage

```typescript
import { TSArgParser } from "tsargparse";
import fs from 'fs';

// Define your command-line arguments
const args = TSArgParser({
  inFile: {
    positional: true,
    description: "Input file path",
    type: "string",
    required: true,
  },
  outFile: {
    long: "output-file",
    short: "o",
    description: "Output file path",
    type: "string",
    default: "output.txt",
  },
  verbose: {
    short: "v",
    description: "Enable verbose logging",
    type: "boolean",
  }
}).parseOrExit();

const input = fs.readFileSync(args.inFile, 'utf-8');

if (args.verbose) {
  console.log("making a lot of noise cuz you asked for verbose");
}

fs.writeFileSync(args.outFile, input, 'utf-8');
```

### Custom Argument Types

```typescript
import { TSArgParser, ParseResult } from "tsargparse";

// Define a custom date parser
function parseDate(argStr: string): ParseResult<Date> {
  if (!argStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { error: "Invalid date format" };
  }
  const date = new Date(argStr);
  return { ok: date };
}

const args = TSArgParser({
  date: {
    description: "Date in YYYY-MM-DD format",
    type: "custom",
    parse: parseDate,
  }
}).parseOrExit();

// args.date will be a Date object
```

## License

MIT
