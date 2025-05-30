import { TSArgParser } from "../src/index.js";

const args = TSArgParser({
  firstPositional: {
    positional: true,
    description: "First positional argument",
    type: "string",
    required: true,
  },
  secondPositional: {
    positional: true,
    description: "Second positional argument (not required)",
    type: "number",
  },
  someOption: {
    description: "Some option",
    type: "string",
  },
  someBooleanOption: {
    short: "s",
    description: "Some boolean option",
    type: "boolean",
    default: true,
  },
}).parseOrExit();

console.log(`firstPositional: ${args.firstPositional}`);

if (args.secondPositional !== undefined) {
  console.log(`secondPositional: ${args.secondPositional}`);
}

console.log(`someOption: ${args.someOption || "<not provided>"}`);

console.log(`someBooleanOption: ${args.someBooleanOption}`);
