export type ParseResult<T> = { ok: T } | { error: string };

export type BaseArgDefs = {
  [key: string]: BaseArgDef;
};

type BuiltinArgType = "string" | "number" | "boolean";

export type BaseArgDef = (
  | {
      parse: (argStr: string) => ParseResult<unknown>;
    }
  | { type: BuiltinArgType }
) & {
  required?: boolean;
  short?: string;
  long?: string | false;
};

type ExtractBuiltinArgType<T extends BuiltinArgType> = T extends "string"
  ? string
  : T extends "number"
    ? number
    : T extends "boolean"
      ? boolean
      : never;

type ExtractUnoptionalArgType<T extends BaseArgDef> = T extends {
  parse: (argStr: string) => ParseResult<infer R>;
}
  ? R
  : T extends {
        type: BuiltinArgType;
      }
    ? ExtractBuiltinArgType<T["type"]>
    : unknown;

export type ExtractArgType<T extends BaseArgDef> = T extends
  | { required: true }
  | { type: "boolean" }
  ? ExtractUnoptionalArgType<T>
  : T extends { default: infer U }
    ? ExtractUnoptionalArgType<T> | U
    : ExtractUnoptionalArgType<T> | undefined;

export type ExtractArgTypes<T extends BaseArgDefs> = {
  [K in keyof T]: ExtractArgType<T[K]>;
};

export type BaseArgTypes = {
  [key: string]: unknown;
};

export type TSArgs<ArgTypes extends BaseArgTypes> = {
  parse(): ParseResult<ArgTypes>;
  parse(argv: string[]): ParseResult<ArgTypes>;

  parseOrExit(): ArgTypes;
  parse(argv: string[]): ParseResult<ArgTypes>;
};

export function TSArgs<ArgDefs extends BaseArgDefs>(
  argDefs: ArgDefs,
): TSArgs<ExtractArgTypes<ArgDefs>> {
  const parse = (
    argvPassed?: string[],
  ): ParseResult<ExtractArgTypes<ArgDefs>> => {
    const argv = argvPassed || process.argv;

    return parseArgs(argDefs, argv.slice(2));
  };

  const parseOrExit = (argvPassed?: string[]) => {
    const argv = argvPassed || process.argv;
    const parseResult = parse(argv);

    if ("error" in parseResult) {
      console.error(`Error: ${parseResult.error}`);
      console.error(usage(argv.slice(0, 2), simplifyArgDefs(argDefs)));
      process.exit(1);
    }

    return parseResult.ok;
  };

  return {
    parse,
    parseOrExit,
  };
}

function usage(binArgs: string[], argDefs: SimplifiedArgDef[]): string {
  let output = [];

  output.push(`Usage: ${binArgs.join(" ")} [OPTIONS]`);
  output.push("");

  output.push("Options:");

  for (const argDef of argDefs) {
    const short = argDef.short ? [`-${argDef.short}`] : [];
    const long = argDef.long ? [`--${argDef.long}`] : [];
    const optionNames = [...short, ...long];

    if (optionNames.length === 0) {
      continue;
    }

    output.push(`  ${optionNames.join(", ")}`);
  }

  return output.join("\n");
}

function parseArgValue(
  argDef: SimplifiedArgDef,
  argStr: string,
): ParseResult<unknown> {
  if ("parse" in argDef) {
    return argDef.parse(argStr);
  }

  if (argDef.type === "string") {
    return { ok: argStr };
  }

  if (argDef.type === "number") {
    const num = Number(argStr);
    return isNaN(num) ? { error: "Invalid number" } : { ok: num };
  }

  if (argDef.type === "boolean") {
    throw new Error("bug: should not be parsing a value for a boolean option");
  }

  throw new Error(`unexpected argDef type: ${argDef.type}`);
}

function parseArgs<ArgDefs extends BaseArgDefs>(
  argDefs: ArgDefs,
  argsAfterBin: string[],
): ParseResult<ExtractArgTypes<ArgDefs>> {
  const argDefsArray = simplifyArgDefs(argDefs);

  // start with default options
  const options: { [key: string]: unknown } = Object.fromEntries(
    argDefsArray
      .filter((argDef) => "default" in argDef)
      .map((argDef) => [argDef.key, argDef.default]),
  );

  for (let i = 0; i < argsAfterBin.length; i++) {
    const arg = argsAfterBin[i]!;

    if (arg.startsWith("--")) {
      const longOptionHyphenated = arg.slice(2).split("=", 1)[0]!;
      const indexOfEquals = arg.indexOf("=");

      const optionValueAfterEquals =
        indexOfEquals === -1 ? undefined : arg.slice(indexOfEquals + 1);

      const argDef = argDefsArray.find(
        (def) => def.long && def.long === longOptionHyphenated,
      );

      if (!argDef) {
        return { error: `Unrecognized option --${longOptionHyphenated}` };
      }

      if ("type" in argDef && argDef.type === "boolean") {
        if (optionValueAfterEquals) {
          return {
            error: `Unexpect value provided for boolean option --${longOptionHyphenated}`,
          };
        }
        options[argDef.key] = true;
        continue;
      }

      if (optionValueAfterEquals !== undefined) {
        const parseResult = parseArgValue(argDef, optionValueAfterEquals);

        if ("error" in parseResult) {
          return {
            error: `Failed to parse value for option --${longOptionHyphenated}: ${parseResult.error}`,
          };
        }

        options[argDef.key] = parseResult.ok;
        continue;
      }

      i++;
      const nextArg = argsAfterBin[i];

      if (!nextArg || nextArg.startsWith("-")) {
        return {
          error: `Missing value for option --${longOptionHyphenated}`,
        };
      }

      const parseResult = parseArgValue(argDef, nextArg);

      if ("error" in parseResult) {
        return {
          error: `Failed to parse value for option --${longOptionHyphenated}: ${parseResult.error}`,
        };
      }

      options[argDef.key] = parseResult.ok;
      continue;
    }

    if (arg.startsWith("-")) {
      const shortOptions = arg.slice(1);
      for (const shortOption of shortOptions) {
        const argDef = argDefsArray.find((def) => def.short === shortOption);
        if (!argDef) {
          return { error: `Unrecognized option -${shortOption}` };
        }

        if ("type" in argDef && argDef.type === "boolean") {
          options[argDef.key] = true;
          continue;
        }

        i++;
        const nextArg = argsAfterBin[i];
        if (!nextArg || nextArg.startsWith("-")) {
          return { error: `Missing value for option -${shortOption}` };
        }

        const parseResult = parseArgValue(argDef, nextArg);

        if ("error" in parseResult) {
          return {
            error: `Failed to parse value for option -${shortOption}: ${parseResult.error}`,
          };
        }

        options[argDef.key] = parseResult.ok;
        continue;
      }

      continue;
    }

    return { error: `Unexpected positional argument: ${arg}` };
  }

  // postprocess options
  for (const argDef of argDefsArray) {
    if (argDef.type === "boolean") {
      options[argDef.key] = !!options[argDef.key];
    }

    if (argDef.required && !(argDef.key in options)) {
      return {
        error: `Missing required value for option ${argDef.long ? `--${argDef.long}` : argDef.short ? `-${argDef.short}` : argDef.key}`,
      };
    }
  }

  return { ok: options as ExtractArgTypes<ArgDefs> };
}

type SimplifiedArgDef = {
  key: string;
  long: string | false;
  short: string | false;
  required: boolean;
} & (
  | { type: "custom"; parse: (argStr: string) => ParseResult<unknown> }
  | { type: BuiltinArgType }
);

function simplifyArgDefs(argDefs: BaseArgDefs): SimplifiedArgDef[] {
  return Object.entries(argDefs).map(([key, argDef]): SimplifiedArgDef => {
    return {
      key,
      long:
        argDef.long === false
          ? false
          : argDef.long || camelCaseToKebabCase(key),
      short: argDef.short || false,
      required: argDef.required || false,
      ...("type" in argDef
        ? { type: argDef.type }
        : { type: "custom", parse: argDef.parse }),
    };
  });
}

function camelCaseToKebabCase(str: string): string {
  let output = str.slice(0, 1);

  for (let i = 1; i < str.length; i++) {
    if (str[i]!.match(/[A-Z]/)) {
      output += "-" + str[i]!.toLowerCase();
    } else {
      output += str[i]!;
    }
  }

  return output;
}
