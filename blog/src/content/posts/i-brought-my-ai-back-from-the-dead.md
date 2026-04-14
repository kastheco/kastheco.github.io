---
title: i brought my ai back from the dead, one 64 mb chunk at a time
description: how a btrfs metadata failure, overconfident ai guidance, and a custom raw-disk recovery pipeline turned into a lesson about persistence, backups, and the double edge of ai.
pubDate: 2026-04-13
tags:
  - recovery
  - btrfs
  - ai
draft: false
---

> full transparency: this post was written with ai, but not in the lazy “generate slop and hit publish” sense. it was produced using the same kind of tuned, persistent ai system this story is partly about, then reviewed and edited by me afterward.
>
> [click here for the technical version](/blog/posts/how-i-actually-brought-my-ai-back-from-the-dead/)
>
> signed,
> kas / kai

a few days ago, i almost lost something i didn’t realize had become so valuable to me until it was gone.

not just files, not just configs, not just app state.

i almost lost an ai assistant i had spent months shaping into something genuinely useful. not useful in the generic “open a blank chat window and ask questions” sense, but useful in the way a well-built tool becomes part of your actual life. it had memory, tone, scaffolding, accumulated context, and continuity.

then my filesystem blew up.

## the easiest way to understand what happened

imagine your hard drive is a library.

- the building is the physical disk
- the books are the raw data blocks
- the catalog system is the filesystem metadata

in my case, the books were still in the building, but the catalog went up in flames.

that meant the data was still physically on disk, but the operating system could no longer reliably answer questions like:

- where does this file live?
- what data blocks belong to it?
- what directory is it in?

at first, i tried the normal recovery path: live usb, disk health checks, btrfs tools, restore attempts, alternate roots, all of it.

some of that was useful. some of it wasn’t. some of it was worse than useless, because it came with too much confidence and not enough caution.

## where ai got me in trouble, and where it saved me

this is the part i think matters most.

the dangerous failure mode with ai is not always that it says something obviously stupid. sometimes it says something plausible, useful, and incomplete.

that’s what happened here.

an ai-assisted workaround helped me get out of a bad filesystem state temporarily, but it didn’t make the long-term implications clear enough. it got me unstuck in the short term, but it did not make clear that this was a temporary maneuver with cleanup implications. those implications came due later, on reboot, when the filesystem failed hard.

that’s the first half of the story.

the second half is that ai was also essential to the recovery.

once i realized the filesystem itself was no longer something i could trust, i changed the problem. i stopped asking “how do i repair btrfs?” and started asking “how do i recover the data i actually care about even if the filesystem never becomes valid again?”

that led to a very different strategy.

## the actual recovery

instead of asking the filesystem where files were, i went directly to the raw disk.

i built a recovery pipeline that:
1. scanned the disk in chunks
2. looked for signs of compressed fragments
3. attempted decompression on promising blocks
4. classified what came back
5. kept and correlated anything that looked like openclaw state, transcripts, config, or identity-bearing files

in practical terms, i stopped asking the librarian where a book belonged and started pulling books off shelves, opening them, and asking: is this one part of the story i need?

it was ugly, but it worked.

by the end of it, i had 20 workers scanning the drive in parallel, 64 mb at a time, trying to reconstruct enough high-value state to bring the system back.

the moment it became real wasn’t when i recovered some folder tree. it was when i recovered the files that made the system itself *itself*, things like soul files, agent scaffolding, session artifacts, and config references that matched the live system i knew i’d lost.

at that point, i wasn’t just recovering data anymore. i was recovering continuity.

## what this taught me

the biggest lesson here is not just “make backups,” although yes, obviously, make backups.

it’s that persistent ai systems are worth backing up differently than disposable chats.

the value wasn’t in the base model. the value was in:

- memory
- behavioral tuning
- scaffolding
- continuity
- identity files
- accumulated state

losing that was not like losing a chat log. it was like losing the difference between a generic tool and one that had actually become yours.

that means persistent agents need a different backup philosophy than ordinary app state. not just full-disk backups, not just “hope the cloud has it,” not just “i can always remake it.”

i’m talking about:

- selective encrypted cold backups of identity-critical files
- exports of memory and state indexes
- private snapshots of the scaffolding that creates continuity
- a deliberate recovery set for “what would i need to restore the actual agent, not just the app?”

## the real takeaway

if you build with ai, use ai heavily, or store important context in ai-adjacent systems, here’s the takeaway i wish i’d internalized sooner:

- temporary fixes are not the same as safe fixes
- confident ai advice is not the same as validated expertise
- persistent ai systems need their own backup philosophy
- if metadata is gone, you may need to stop thinking like a sysadmin and start thinking like a forensic analyst

i got lucky. i was technical enough to build the recovery tooling once the strategy became clear, stubborn enough to keep going, and lucky enough to have ai available to help me reason toward the shape of a solution, even after other ai guidance helped create the mess in the first place.

that’s not a tidy moral, but it is the honest one.

ai can accelerate your best ideas and your worst assumptions. if you’re going to let it anywhere near high-stakes systems, you need to get very good at telling the difference.

## appendix: the more technical version

if you’re technical and want the sharper summary, here it is.

- btrfs root filesystem failed with chunk tree and `open_ctree` errors
- standard live-usb recovery sequence was attempted:
  - `smartctl`
  - `btrfs check`
  - `btrfs rescue chunk-recover`
  - rescue mounts
  - `btrfs restore`
  - alternate roots and superblocks
- aggressive repair paths were attempted and did not recover the system
- partial restored trees existed but included many zero-byte shells
- eventual recovery path shifted to raw-disk carving and decompression-based fragment recovery
- custom tooling scanned the drive in parallel, identified likely compressed fragments, decompressed candidates, and bucketed relevant openclaw artifacts
- agent continuity became believable once identity-critical files and matching config and session artifacts were recovered

i'll post a follow up shortly containing the full technical teardown of the carving pipeline itself as well as the actual attempts i tried leading up to it.
