import chalk from "chalk";

export type ParseResult<T> = { ok: T } | { error: string };

export type BaseArgDefs = {
  [key: string]: ArgDef;
};

export type ArgDef =
  | ({
      positional: true;
    } & BaseArgDef)
  | ({ positional?: false } & OptionDef);

export type OptionDef = {
  long?: string;
  short?: string;
} & BaseArgDef;

export type BaseArgDef = {
  required?: boolean;
  default?: unknown;
  valueName?: string;
  description?: string;
} & (
  | {
      type: BuiltinArgType;
    }
  | {
      type: "custom";
      parse: (argStr: string) => ParseResult<unknown>;
    }
);

type BuiltinArgType = "string" | "number" | "boolean";

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
      console.error(
        usage(
          argv.slice(0, 2),
          getPositionalArgDefs(argDefs),
          getOptionDefs(argDefs),
        ),
      );
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

function usage(
  binArgs: string[],
  positionalArgDefs: BaseArgDefWithKey[],
  optionDefs: OptionDefWithKey[],
): string {
  let output = [];

  const positionalArgText = positionalArgDefs
    .map((argDef) => {
      return `<${camelCaseToKebabCase(argDef.key).toUpperCase()}>`;
    })
    .join(" ");

  output.push(
    `${chalk.bold("Usage:")} ${binArgs.join(" ")}${positionalArgText ? " " + positionalArgText : ""} ${optionDefs.length > 0 ? "[OPTIONS]" : ""}`,
  );
  output.push("");

  output.push(chalk.bold("Options:"));

  const optionsRows = optionDefs.map((optionDef) => {
    const shortText =
      optionDef.short && optionDef.long
        ? `-${optionDef.short}, `
        : optionDef.short
          ? `-${optionDef.short}`
          : "";

    const longText = optionDef.long ? `--${optionDef.long}` : "";

    const valueName = optionDef.valueName
      ? optionDef.valueName.toUpperCase()
      : optionDef.type === "number"
        ? "NUMBER"
        : optionDef.type === "string"
          ? "STRING"
          : "VALUE";

    const valueText = optionDef.type !== "boolean" ? ` [${valueName}]` : "";

    const defaultText =
      optionDef.default !== undefined && optionDef.type !== "custom"
        ? `[Default: ${optionDef.default}]`
        : "";

    const descriptionText = [
      ...(optionDef.description ? [optionDef.description] : []),
      ...(defaultText ? [defaultText] : []),
    ].join(" ");

    return [
      chalk.bold(shortText),
      chalk.bold(longText) + valueText,
      "  ",
      descriptionText,
    ];
  });

  output.push(
    outputTable(optionsRows, ["right", "left", "left", "left"], "  "),
  );

  return output.join("\n");
}

function parseArgValue(
  argDef: BaseArgDef,
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
  const optionArgDefs = getOptionDefs(argDefs);
  const positionalArgDefs = getPositionalArgDefs(argDefs);
  const remainingPositionalArgDefs = [...positionalArgDefs];

  // start with default arg Values
  const argValues: { [key: string]: unknown } = Object.fromEntries(
    Object.entries(argDefs)
      .filter(([_key, argDef]) => "default" in argDef)
      .map(([key, argDef]) => [key, argDef.default]),
  );

  for (let i = 0; i < argsAfterBin.length; i++) {
    const arg = argsAfterBin[i]!;

    if (arg.startsWith("--")) {
      const longOptionHyphenated = arg.slice(2).split("=", 1)[0]!;
      const indexOfEquals = arg.indexOf("=");

      const optionValueAfterEquals =
        indexOfEquals === -1 ? undefined : arg.slice(indexOfEquals + 1);

      const argDef = optionArgDefs.find(
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
        argValues[argDef.key] = true;
        continue;
      }

      if (optionValueAfterEquals !== undefined) {
        const parseResult = parseArgValue(argDef, optionValueAfterEquals);

        if ("error" in parseResult) {
          return {
            error: `Failed to parse value for option --${longOptionHyphenated}: ${parseResult.error}`,
          };
        }

        argValues[argDef.key] = parseResult.ok;
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

      argValues[argDef.key] = parseResult.ok;
      continue;
    }

    if (arg.startsWith("-")) {
      const shortOptions = arg.slice(1);
      for (const shortOption of shortOptions) {
        const argDef = optionArgDefs.find((def) => def.short === shortOption);
        if (!argDef) {
          return { error: `Unrecognized option -${shortOption}` };
        }

        if ("type" in argDef && argDef.type === "boolean") {
          argValues[argDef.key] = true;
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

        argValues[argDef.key] = parseResult.ok;
        continue;
      }

      continue;
    }

    const nextPositionalArgDef = remainingPositionalArgDefs.shift();

    if (!nextPositionalArgDef) {
      return { error: `Unexpected positional argument: ${arg}` };
    }

    const parseResult = parseArgValue(nextPositionalArgDef, arg);

    if ("error" in parseResult) {
      return {
        error: `Failed to parse value for positional argument ${nextPositionalArgDef.key}: ${parseResult.error}`,
      };
    }

    argValues[nextPositionalArgDef.key] = parseResult.ok;
    continue;
  }

  // postprocess arg values
  for (const [key, argDef] of Object.entries(argDefs)) {
    if (argDef.type === "boolean") {
      argValues[key] = !!argValues[key];
    }

    if (argDef.required && !(key in argValues)) {
      const argText = argDef.positional
        ? `positional argument ${camelCaseToKebabCase(key).toUpperCase()}`
        : `option --${argDef.long || camelCaseToKebabCase(key)}`;

      return {
        error: `Missing required value for ${argText}`,
      };
    }
  }

  return { ok: argValues as ExtractArgTypes<ArgDefs> };
}

type OptionDefWithKey = OptionDef & { key: string };

function getOptionDefs(argDefs: BaseArgDefs): OptionDefWithKey[] {
  return Object.entries(argDefs)
    .filter(([_key, argDef]) => !argDef.positional)
    .map(([key, argDef]: [string, OptionDef]) => {
      return {
        ...argDef,
        key,
        long: argDef.long || camelCaseToKebabCase(key),
      };
    });
}

type BaseArgDefWithKey = BaseArgDef & { key: string };

function getPositionalArgDefs(argDefs: BaseArgDefs): BaseArgDefWithKey[] {
  return Object.entries(argDefs)
    .filter(([_key, argDef]) => argDef.positional)
    .map(([key, argDef]: [string, BaseArgDef]) => {
      return {
        ...argDef,
        key,
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
