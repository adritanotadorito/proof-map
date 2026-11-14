/** Pure path classification, shared by context gathering and routing. */
export type FileKind = "source" | "test" | "doc" | "config";

export function classifyFile(path: string): FileKind {
  if (/(^|\/)(tests?|specs?|__tests__)\//i.test(path) || /(Tests?|\.test|\.spec)\.[a-z]+$/i.test(path)) return "test";
  if (/\.(md|mdx|txt|rst|adoc)$/i.test(path) || /(^|\/)docs?\//i.test(path)) return "doc";
  if (/\.(props|targets|csproj|sln|json|ya?ml|toml|xml|lock|config|editorconfig|gitignore)$/i.test(path)) return "config";
  return "source";
}

/** Path fragments that usually mean security-relevant code. A match is a signal to look, not a verdict. */
const SENSITIVE = /(auth|login|passw|secret|token|credential|crypt|cipher|signature|permission|acl|sanitiz|deserializ|security|session|oauth|jwt)/i;
export const isSecuritySensitive = (path: string) => SENSITIVE.test(path);

/** Files that change what gets built or which dependencies are pulled in. */
const BUILD = /((^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|Directory\.(Packages|Build)\.props|nuget\.config|Dockerfile|Makefile)$|\.(csproj|fsproj|sln|targets)$|^\.github\/workflows\/)/i;
export const isBuildOrDependency = (path: string) => BUILD.test(path);
