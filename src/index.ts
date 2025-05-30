import chalk from "chalk";

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
  description?: string;
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
      console.error(`${chalk.bold("Error:")} ${parseResult.error}`);
      console.error();
      console.error(usage(argv.slice(0, 2), simplifyArgDefs(argDefs)));
      console.error();
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

  output.push(`${chalk.bold("Usage:")} ${binArgs.join(" ")} [OPTIONS]`);
  output.push("");

  output.push(chalk.bold("Options:"));

  const optionsRows = argDefs.map((argDef) => {
    const shortText =
      argDef.short && argDef.long ? argDef.short + ", " : argDef.short || "";
    const longText = argDef.long || "";

    return [
      chalk.bold(shortText),
      chalk.bold(longText),
      "  ",
      argDef.description || "",
    ];
  });

  output.push(
    outputTable(optionsRows, ["right", "left", "left", "left"], "  "),
  );

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
  description: string | undefined;
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
      description: argDef.description,
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

type Justification = "left" | "right";

function outputTable(
  rows: string[][],
  justifications: Justification[],
  indentation: string,
): string {
  const maxColumnLengths: number[] = [];

  for (const row of rows) {
    row.forEach((cellText, i) => {
      maxColumnLengths[i] = Math.max(
        maxColumnLengths[i] || 0,
        visibleLen(cellText),
      );
    });
  }

  return rows
    .map((row) => {
      return (
        indentation +
        row
          .map((cellText, i) => {
            const justification = justifications[i] || "left";
            const maxColumnLength = maxColumnLengths[i] || 0;

            const paddedText =
              justification === "left"
                ? padEndVisible(cellText, maxColumnLength, " ")
                : padStartVisible(cellText, maxColumnLength, " ");

            return paddedText;
          })
          .join("")
      );
    })
    .join("\n");
}

const ANSI = /\x1b\[[0-9;]*m/g;

const visibleLen = (s: string) => s.replace(ANSI, "").length;

function padStartVisible(str: string, minWidth: number, ch = " ") {
  const len = visibleLen(str);
  if (len >= minWidth) return str;
  return ch.repeat(minWidth - len) + str;
}

function padEndVisible(str: string, minWidth: number, ch = " ") {
  const len = visibleLen(str);
  if (len >= minWidth) return str;
  return str + ch.repeat(minWidth - len);
}
