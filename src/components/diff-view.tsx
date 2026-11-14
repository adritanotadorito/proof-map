import { parsePatch } from "@/lib/patch";

const rowClass = { add: "bg-diff-add", del: "bg-diff-del", ctx: "" } as const;
const numClass = { add: "bg-diff-add-num", del: "bg-diff-del-num", ctx: "" } as const;
const sign = { add: "+", del: "-", ctx: " " } as const;

/** A unified diff with old and new line numbers, in the familiar two-gutter layout. */
export function DiffView({ patch }: { patch: string }) {
  const rows = parsePatch(patch);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-xs leading-5">
        <tbody>
          {rows.map((row, i) =>
            row.kind === "hunk" || row.kind === "note" ? (
              <tr key={i} className="bg-diff-hunk text-muted">
                <td colSpan={2} className="select-none px-2 text-right">
                  {row.kind === "hunk" ? "···" : ""}
                </td>
                <td colSpan={2} className="whitespace-pre px-2 py-0.5">
                  {row.text}
                </td>
              </tr>
            ) : (
              <tr key={i} className={rowClass[row.kind]}>
                <td className={`w-[1%] min-w-10 select-none px-2 text-right text-muted ${numClass[row.kind]}`}>{row.oldNo ?? ""}</td>
                <td className={`w-[1%] min-w-10 select-none px-2 text-right text-muted ${numClass[row.kind]}`}>{row.newNo ?? ""}</td>
                <td className="w-5 select-none text-center text-muted">{sign[row.kind]}</td>
                <td className="whitespace-pre pr-4">{row.text}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
