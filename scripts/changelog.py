from __future__ import annotations

import argparse
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path


# Convention: this script lives at <project_root>/scripts/changelog.py, so
# parents[1] is the project root where CHANGELOG.md sits. Override per-call
# with --changelog if you need a different location (also used in tests).
ROOT = Path(__file__).resolve().parents[1]
CHANGELOG = ROOT / "CHANGELOG.md"

DATE_HEADING_RE = re.compile(r"^## (\d{4}-\d{2}-\d{2})(?:[：:](.*))?\s*$")
SECTION_HEADING_RE = re.compile(r"^###\s+(.+?)\s*$")


def read_lines(path: Path = CHANGELOG) -> list[str]:
    if not path.is_file():
        raise SystemExit(f"CHANGELOG not found: {path}")
    return path.read_text(encoding="utf-8").splitlines()


def write_lines(lines: list[str], path: Path = CHANGELOG) -> None:
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def first_date_index(lines: list[str]) -> int:
    for index, line in enumerate(lines):
        if DATE_HEADING_RE.match(line):
            return index
    raise SystemExit("CHANGELOG has no date heading like '## YYYY-MM-DD'")


def bootstrap_insert_index(lines: list[str]) -> int:
    """Pick where to insert the very first date block in a CHANGELOG that has none.

    Convention: place it right after the leading ``# CHANGELOG`` H1 (and the
    blank line that typically follows). If no H1 exists, fall back to the top.
    """
    for index, line in enumerate(lines):
        if line.startswith("# "):
            tail = index + 1
            while tail < len(lines) and lines[tail].strip() == "":
                tail += 1
            return tail
    return 0


def iter_date_blocks(lines: list[str]) -> list[tuple[int, int, str, str]]:
    blocks: list[tuple[int, int, str, str]] = []
    starts = [index for index, line in enumerate(lines) if DATE_HEADING_RE.match(line)]
    for pos, start in enumerate(starts):
        match = DATE_HEADING_RE.match(lines[start])
        assert match is not None
        end = starts[pos + 1] if pos + 1 < len(starts) else len(lines)
        blocks.append((start, end, match.group(1), (match.group(2) or "").strip()))
    return blocks


def iter_sections(block_lines: list[str]) -> list[tuple[int, int, str]]:
    starts = [
        index for index, line in enumerate(block_lines) if SECTION_HEADING_RE.match(line)
    ]
    sections: list[tuple[int, int, str]] = []
    for pos, start in enumerate(starts):
        match = SECTION_HEADING_RE.match(block_lines[start])
        assert match is not None
        end = starts[pos + 1] if pos + 1 < len(starts) else len(block_lines)
        while end > start and block_lines[end - 1].strip() in {"", "---"}:
            end -= 1
        sections.append((start, end, match.group(1)))
    return sections


def language_for(lines: list[str]) -> str:
    english_markers = (
        "[Today's date",
        "Initialize documentation system",
        "Notes:",
        "#### Changes",
        "#### Migration Impact",
    )
    if any(any(marker in line for marker in english_markers) for line in lines[:80]):
        return "en"
    return "zh"


def print_block(lines: list[str], start: int, end: int) -> None:
    print("\n".join(lines[start:end]).strip())


def command_titles(args: argparse.Namespace) -> None:
    lines = read_lines(args.changelog)

    count = 0
    for start, end, day, title in iter_date_blocks(lines):
        if args.limit and count >= args.limit:
            break
        suffix = f"：{title}" if title else ""
        print(f"{day}{suffix}")
        for section_start, _section_end, section_title in iter_sections(lines[start:end]):
            if section_start == 0:
                continue
            print(f"  - {section_title}")
        count += 1


def command_recent(args: argparse.Namespace) -> None:
    lines = read_lines(args.changelog)
    cutoff = date.today() - timedelta(days=args.days)
    for start, end, day, title in iter_date_blocks(lines):
        try:
            day_value = datetime.strptime(day, "%Y-%m-%d").date()
        except ValueError:
            continue
        if day_value < cutoff:
            continue
        suffix = f"：{title}" if title else ""
        print(f"{day}{suffix}")
        for _section_start, _section_end, section_title in iter_sections(lines[start:end]):
            print(f"  - {section_title}")


def command_show(args: argparse.Namespace) -> None:
    lines = read_lines(args.changelog)

    if args.match:
        pattern = args.match
        printed = 0
        for start, end, day, title in iter_date_blocks(lines):
            block = lines[start:end]
            header_text = f"{day} {title}".strip()
            matching_sections: list[tuple[int, int, str]] = []
            for section_start, section_end, section_title in iter_sections(block):
                section_text = "\n".join(block[section_start:section_end])
                if pattern in section_title or pattern in section_text:
                    matching_sections.append((section_start, section_end, section_title))

            if matching_sections:
                print(block[0])
                for section_start, section_end, _section_title in matching_sections:
                    print()
                    print_block(block, section_start, section_end)
                    printed += 1
                    if args.limit and printed >= args.limit:
                        return
                print()
            elif pattern in header_text:
                print(block[0])
                printed += 1
                if args.limit and printed >= args.limit:
                    break
        return

    if not args.date:
        raise SystemExit("show requires --date or --match")

    for start, end, day, _title in iter_date_blocks(lines):
        if day != args.date:
            continue
        block = lines[start:end]
        if not args.section:
            print_block(lines, start, end)
            return
        for section_start, section_end, section_title in iter_sections(block):
            if args.section in section_title:
                print_block(block, section_start, section_end)
                return
        raise SystemExit(f"section not found on {args.date}: {args.section}")

    raise SystemExit(f"date not found: {args.date}")


def format_add_block(args: argparse.Namespace, language: str) -> list[str]:
    body_lines = args.body.splitlines() if args.body else []
    migration_lines = args.migration.splitlines() if args.migration else []
    body_heading = "Changes" if language == "en" else "变更内容"
    migration_heading = "Migration Impact" if language == "en" else "迁移影响"
    placeholder = "TBD" if language == "en" else "待补充"

    block = [f"### {args.title.strip()}", ""]
    if body_lines:
        block.append(f"#### {body_heading}")
        block.extend(f"- {line.strip()}" for line in body_lines if line.strip())
        block.append("")
    if migration_lines:
        block.append(f"#### {migration_heading}")
        block.extend(f"- {line.strip()}" for line in migration_lines if line.strip())
        block.append("")
    if not body_lines and not migration_lines:
        block.append(f"- {placeholder}")
        block.append("")
    return block


def command_add(args: argparse.Namespace) -> None:
    lines = read_lines(args.changelog)
    target_date = args.date or date.today().isoformat()
    new_block = format_add_block(args, language_for(lines))

    blocks = iter_date_blocks(lines)
    for start, end, day, _title in blocks:
        if day != target_date:
            continue
        insert_at = end
        while insert_at > start and lines[insert_at - 1].strip() in {"", "---"}:
            insert_at -= 1
        lines[insert_at:insert_at] = [""] + new_block
        write_lines(lines, args.changelog)
        return

    has_any_date = any(DATE_HEADING_RE.match(line) for line in lines)
    insert_at = first_date_index(lines) if has_any_date else bootstrap_insert_index(lines)
    heading_title = f"：{args.date_title.strip()}" if args.date_title else ""
    date_block = [f"## {target_date}{heading_title}", ""] + new_block + ["---", ""]
    lines[insert_at:insert_at] = date_block
    write_lines(lines, args.changelog)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Token-light CHANGELOG helper for agents."
    )
    parser.add_argument(
        "--changelog",
        type=Path,
        default=CHANGELOG,
        help="Path to CHANGELOG.md",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_titles = sub.add_parser("titles", help="Print date and section title tree only.")
    p_titles.add_argument("--limit", type=int, default=0)
    p_titles.set_defaults(func=command_titles)

    p_recent = sub.add_parser("recent", help="Print recent date and section titles.")
    p_recent.add_argument("--days", type=int, default=7)
    p_recent.set_defaults(func=command_recent)

    p_show = sub.add_parser("show", help="Print one date block or matching blocks.")
    p_show.add_argument("--date")
    p_show.add_argument("--section")
    p_show.add_argument("--match")
    p_show.add_argument("--limit", type=int, default=3)
    p_show.set_defaults(func=command_show)

    p_add = sub.add_parser("add", help="Append a section to today's date block.")
    p_add.add_argument("--date")
    p_add.add_argument("--date-title")
    p_add.add_argument("--title", required=True)
    p_add.add_argument("--body", default="")
    p_add.add_argument("--migration", default="")
    p_add.set_defaults(func=command_add)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    # Force UTF-8 on stdout/stderr so non-ASCII (Chinese) titles render correctly
    # on Windows consoles whose default code page is cp936/cp1252.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    main(sys.argv[1:])
