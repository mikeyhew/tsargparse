import { TSArgs } from "../src/index.js";

const args = TSArgs({
  flag: {
    description: "Some Boolean flag",
    type: "boolean",
    default: false,
  },
  foo: {
    description: "Description for foo",
    required: true,
    type: "string",
  },
  optionalNumber: {
    description: "Optional number argument",
    type: "number",
  },
  defaultedNumber: {
    short: "d",
    description: "Defaulted number argument",
    type: "number",
    default: 42,
  },
}).parseOrExit();

console.log(`foo: ${args.foo}`);

if (args.optionalNumber !== undefined) {
  console.log(`optionalNumber: ${args.optionalNumber}`);
}
