import { Download, Keyboard, Link2, MoreHorizontal, Upload } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

/**
 * Shared overflow menu for list actions (share / import / export / help).
 * One menu on every screen — the old desktop-only icon buttons hid
 * share/export from phones. `onHelp` is optional (only AppShell owns the
 * shortcuts dialog).
 */
export function ListActionsMenu({
  onShare,
  onImport,
  onExport,
  onHelp,
}: {
  onShare: () => void;
  onImport: () => void;
  onExport: () => void;
  onHelp?: () => void;
}) {
  // Non-modal: a modal dropdown locks body scroll and compensates with a
  // padding-right, which visibly shoves the whole centered page left.
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="rounded-[10px] border border-line/80 bg-raised/95 p-2.5 text-dim shadow-sm transition hover:border-lime/40 hover:text-ink"
          aria-label="Actions de la liste"
          title="Actions de la liste"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[230px] rounded-[12px] border border-line bg-raised p-1.5 shadow-xl"
        >
          <DropdownMenu.Item
            onSelect={onShare}
            className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm outline-none hover:bg-bg focus:bg-bg"
          >
            <Link2 className="size-4 text-dim" />
            Partager la liste
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={onImport}
            className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm outline-none hover:bg-bg focus:bg-bg"
          >
            <Upload className="size-4 text-dim" />
            Importer MAL / AniList
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={onExport}
            className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm outline-none hover:bg-bg focus:bg-bg"
          >
            <Download className="size-4 text-dim" />
            Exporter en JSON
          </DropdownMenu.Item>
          {onHelp ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item
                onSelect={onHelp}
                className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm outline-none hover:bg-bg focus:bg-bg"
              >
                <Keyboard className="size-4 text-dim" />
                Raccourcis clavier
                <kbd className="ml-auto rounded border border-line bg-bg px-1.5 font-mono text-[10px] text-dim">
                  ?
                </kbd>
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
