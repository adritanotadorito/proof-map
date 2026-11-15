import { parsePatch } from "@/lib/patch";

const rowClass = { add: "bg-diff-add", del: "bg-diff-del", ctx: "" } as const;
const numClass = { add: "bg-diff-add-num", del: "bg-diff-del-num", ctx: "" } as const;
const sign = { add: "+", del: "−", ctx: " " } as const;
const signClass = { add: "text-success", del: "text-danger", ctx: "" } as const;

/** Something shown directly under one line of the new file, such as an AI statement that cites it. */
export type InlineNote = { line: number; key: string; node: React.ReactNode };

/**
 * A unified diff with old and new line numbers, in the familiar two-gutter layout. It scrolls
 * sideways instead of wrapping, so code stays readable on a narrow screen; inline notes stay
 * pinned to the visible width while the code scrolls.
 */
export function DiffView({ patch, notes = [] }: { patch: string; notes?: InlineNote[] }) {
  const rows = parsePatch(patch);
  const num = "w-[1%] min-w-[44px] select-none px-2.5 text-right text-muted sm:min-w-[52px]";
  return (
    <div className="@container overflow-x-auto">
      <table className="w-full border-collapse font-mono text-xs leading-5 sm:text-[13px] sm:leading-[22px]">
        <tbody>
          {rows.flatMap((row, i) => {
            if (row.kind === "hunk" || row.kind === "note") {
              return [
                <tr key={i} className="bg-diff-hunk text-muted">
                  <td colSpan={2} className="select-none px-2.5 text-center">
                    {row.kind === "hunk" ? "⋯" : ""}
                  </td>
                  <td colSpan={2} className="whitespace-pre px-2 py-1">
                    {row.text}
                  </td>
                </tr>,
              ];
            }
            const out = [
              <tr key={i} className={rowClass[row.kind]}>
                <td className={`${num} ${numClass[row.kind]}`}>{row.oldNo ?? ""}</td>
                <td className={`${num} ${numClass[row.kind]}`}>{row.newNo ?? ""}</td>
                <td className={`w-7 select-none text-center font-semibold ${signClass[row.kind]}`}>{sign[row.kind]}</td>
                <td className="whitespace-pre pr-6">{row.text}</td>
              </tr>,
            ];
            for (const note of row.newNo === null ? [] : notes.filter((n) => n.line === row.newNo)) {
              out.push(
                <tr key={`${i}-${note.key}`} data-testid="inline-note">
                  <td colSpan={4} className="p-0">
                    <div className="sticky left-0 w-[100cqw] whitespace-normal border-y border-line bg-background font-sans">{note.node}</div>
                  </td>
                </tr>,
              );
            }
            return out;
          })}
        </tbody>
      </table>
    </div>
  );
}
