---
title: how i actually brought my ai back from the dead
titleBadge: technical write-up
description: a technical recounting of a btrfs metadata failure, the failed recovery attempts that came first, and the raw-disk zstd carving pipeline that eventually restored enough openclaw state to bring kai back.
pubDate: 2026-04-13
tags:
  - recovery
  - btrfs
  - ai
  - technical
draft: false
---

> note: this is the technical follow-up to the quick version. this one is for the people who want the actual commands, the failed branches, the scheduler choices, the hardware, and the recovery logic.

[click here for the quick version](/blog/posts/i-brought-my-ai-back-from-the-dead/)

the first post was the quick version. this is the one for the people who actually care how it worked.

what failed was a btrfs root filesystem. what almost disappeared with it was a persistent openclaw agent, kai, whose value lived far less in the base model than in the accumulated state around it: prompts, memory, identity files, transcripts, continuity, and all the small pieces of scaffolding that make a persistent agent feel like itself.

this post is the technical path from “btrfs cannot open the chunk tree” to “i can hold a live discord conversation with the recovered agent again.”

## the machines that mattered

### the broken machine

this was the source system, the thing i was trying to recover from. The relevant details were a btrfs root filesystem with subvolumes including `@`, `@home`, `@games`, and others, plus desktop hardware built around a ryzen 7 9800x3d and rx 7900 xtx. once the disk was pulled out into recovery flow, the target later showed up externally as `/dev/sdb2` in a sabrent 1 tb usb enclosure.

### the recovery workstation: framework laptop 16

the second machine mattered more than i expected, and i want to be explicit about that because it genuinely changed what was feasible. this was not just a side laptop. once plugged in and under sustained load, it functioned as a real second compute node.

captured hardware details:

- framework laptop 16 (amd ryzen ai 300 series)
- hardware sku: `FRAGAMCP09`
- cpu: amd ryzen ai 9 hx 370 with radeon 890m
- 12 cores / 24 threads
- max boost: 5.15 ghz
- ram: ~62 gi usable from 64 gb installed
- swap: 128 gi zram
- internal storage: wd_black sn7100 2 tb nvme
- kernel: `6.19.11-1-cachyos`
- firmware: `03.04`

it was plugged into ac through the carving run, ran for about 13 hours wall time, and spent roughly 10 of those hours with all 24 threads pegged at 100% cpu.

that machine let me keep the recovery target separate from the analysis machine, run the carver hard without also trying to do everything else on the same box, keep transcripts, logs, and parallel reasoning sessions alive while scans were running, and treat the recovery like a live engineering effort instead of a one-shot hail mary. if i post this publicly, i probably will tag framework because, honestly, the laptop earned its place in the story.

## the scheduler and tuning angle

the laptop was running cachyos, which means sched-ext was in play.

captured post-run defaults:

- cpufreq governor: `powersave`
- energy performance preference: `balance_performance`
- amd pstate mode: `active`
- default sched-ext scheduler: `scx_lavd`

an important nuance here is that on modern amd pstate, `powersave` does not mean “stuck slow.” it still boosts aggressively under load, and this box could still climb to 5.15 ghz.

during the heavy carving phases, i switched the sched-ext scheduler from `scx_lavd` to `scx_p2dq`. that was the right move for the job. `scx_lavd` is latency-oriented and great for interactive use, while `scx_p2dq` is the better fit for long-running, throughput-heavy, heavily parallel cpu work. that is exactly what this recovery became. there is some uncertainty about the exact moment of the switch, because i do not have a kernel log proving when it happened, but the recollection and supporting notes are solid enough that i am comfortable saying it was part of the recovery tuning story.

## the trigger, as best i currently understand it

the filesystem had gotten into severe metadata and inode pressure. at that point, an image-backed workaround was used to temporarily give btrfs breathing room again.

in plain terms, a `.img` file was created and effectively used as extra storage to get the system unstuck. and, to be fair, it did work in the short term. the machine came back.

the problem was that it was a temporary maneuver with lifecycle cost, not a stable fix. that cost was not emphasized clearly enough, and the cleanup path was not emphasized clearly enough either. a few days later, on reboot, the filesystem failed hard with chunk tree and `open_ctree` errors.

that is the whole incident in miniature: something can be directionally helpful and still dangerously incomplete.

## first visible failure

the system failed on boot with errors including:

- `failed to read chunk tree: -2`
- `open_ctree failed: -2`

at that point this was clearly a low-level metadata problem, not a normal boot problem.

## phase 1: conventional recovery

the first phase was the obvious one. boot a live environment and see whether btrfs could still recover itself.

that included, at various points:

```bash
sudo mount -o ro,degraded,rescue=all /dev/sdb2 /mnt/old
sudo btrfs-find-root /dev/sdb2
sudo btrfs-find-root -a /dev/sdb2
sudo btrfs inspect-internal dump-super -a /dev/sdb2
sudo btrfs restore -i -v -t 1263568306176 -r 256 \
  --path-regex '^(/|/var|/var/lib|/var/lib/openclaw(/.*)?)$' \
  /dev/sdb2 /tmp/openclaw-recovery/gen-725169/
```

other standard tools were in the mix too, including `smartctl`, `btrfs check`, `btrfs rescue chunk-recover`, rescue mounts, and plain `btrfs restore` attempts.

what this phase established was that the nvme did not look obviously physically dead, the disk still contained meaningful structure, older roots still existed, btrfs could sometimes walk parts of the tree, and subvolume layout mattered a lot.

what it did not deliver was a usable recovery. the mount attempt is the best example of why. this command worked:

```bash
sudo mount -o ro,degraded,rescue=all /dev/sdb2 /mnt/old
```

but once mounted, the apparent success was misleading. btrfs could walk to `.openclaw/`, but the files inside were effectively dead. the directory structure was there, but the payloads were gone from the live tree’s point of view. that is the moment where “the filesystem can still show me a shape” stopped meaning “the filesystem can still recover my data.”

## phase 2: historical root-tree archaeology

once the obvious path stalled, i started doing tree archaeology. that meant using `btrfs-find-root` and targeted `btrfs restore -t <bytenr>` attempts to look for older roots that predated the corruption.

this turned out to matter. the one historical root that really got somewhere was generation `725169`, at bytenr `1263568306176`. that root was able to walk past the damaged region and recover the `@` subvolume’s `/var/lib/openclaw/` home, including the full `.openclaw.bak/workspace-liz/` backup workspace.

that backup was about 2.3 gb, had 221 real files, and preserved git history through april 1. that was real progress, but it was still not the live state i actually needed. the important limitation was that the historical root recovered the backup workspace, not the live `.openclaw/state/` or the live workspaces whose metadata pointers had fallen into the dead zone. so this phase proved survivability, but it did not yet restore continuity.

## phase 3: a dead end that taught me something

before the actual winning strategy, i tried the most obvious dumb-forensics move:

```bash
sudo timeout 300 grep -a -b -m 20 'Session Key: agent:workspace' /dev/sdb2
```

it produced zero useful hits. that looked discouraging for a second, but it was actually informative. the reason plaintext grep failed is simple: the relevant file data on disk was not sitting there as plaintext. btrfs was writing compressed extents with zstd.

so the next conclusion became obvious. if the bytes were still there, i probably had to carve zstd frames and decompress them before any higher-level content would become visible.

that was the real pivot.

## phase 4: stop trusting metadata, start reading the disk

this is the point where the recovery stopped being a filesystem repair exercise and became a forensic reconstruction exercise.

i stopped asking “how do i make btrfs healthy again?” and started asking “how do i recover enough high-value payload from the raw device that i can reconstruct the system even if btrfs never becomes healthy again?”

that is a fundamentally different problem, and it leads to a fundamentally different tool.

## the raw zstd carver

the winning path became a custom script called `openclaw-carve-enhanced.py`. it started from an earlier carver copied from the desktop side, then got enhanced and parallelized on the framework laptop.

one of the earliest handoff commands in shell history is literally:

```bash
scp kas@192.168.2.100:/home/kas/openclaw-carve.sh /tmp/
```

from there, the enhanced version became the real workhorse.

### what it actually did

at a high level, the script did this:

1. read the raw block device in 64 mb windows
2. overlap windows by 2 mb so frames crossing boundaries would not get missed
3. scan each window for the zstd magic bytes `28 b5 2f fd`
4. try to decompress starting at each candidate offset
5. chain adjacent zstd frames when possible, up to 128 frames or 64 mb decoded
6. inspect the decoded output for openclaw-specific signatures
7. filter out code-noise and duplicate hits
8. classify the decoded payload by content type
9. write hits plus sidecar metadata to disk
10. resume safely if interrupted, using checkpoints

that is why the carver worked where grep did not. grep was looking for plaintext on a compressed disk, while the carver was looking for compression frames and then decoding them.

### important implementation details

the script was better than a dumb frame dumper in a few ways. it supported multi-frame chaining so adjacent compressed extents could be stitched together, used strong openclaw signature lists including workspace ids, discord metadata, memory paths, and known channel ids, filtered out code-noise so random library code containing weak matches would not pollute the results, used sha256 dedup to avoid re-saving the same decoded content repeatedly, classified decoded payloads into `markdown`, `json`, `json-fragment`, `sqlite`, `text`, `xml-html`, and `binary`, isolated worker file descriptors so each worker could log cleanly in parallel, and supported checkpoint-based resume.

the wrapper around it also mattered. the actual launch path on the laptop used `ionice` and `nice` so the job got serious i/o and cpu priority without pretending it was the only process on the machine:

```bash
sudo ionice -c 2 -n 0 nice -n -10 \
  python3 /home/kas/recovery_scripts/openclaw-carve-enhanced.py \
  /dev/sdb2 /home/kas/openclaw-carved/ --start-offset=400G --workers=4
```

that command, or slight variants of it, is the backbone of the run.

## the search geometry

one of the things i like most about the logs is that they show this was not one static scan. the search geometry kept changing as evidence came in.

### phase 1

phase 1 was the initial broad sweep over the upper portion of the disk.

- target range: `400G → 929.5G`
- initial workers: 4
- later scaled to 8
- total hits: 21,561

worker distribution was highly uneven, which is exactly what you would expect when the interesting material is clustered rather than uniform. notably, phase 1 produced workers with counts like worker 4 at 10,939 hits, worker 3 at 6,067 hits, worker 0 at 2,731 hits, and several others in the low hundreds or lower. that is one of the first strong signals that some regions were simply much richer than others.

### phase 2

phase 2 was the targeted hot-zone scan after phase 1 suggested where the good stuff was clustering:

```bash
mkdir -p /home/kas/openclaw-carved-p2 && \
sudo ionice -c 2 -n 0 nice -n -10 \
  python3 /home/kas/recovery_scripts/openclaw-carve-enhanced.py \
  /dev/sdb2 /home/kas/openclaw-carved-p2/ \
  --start-offset=370G --end-offset=490G --workers=15
```

phase 2 details:

- target range: `370G → 490G`
- workers: 15
- total hits: 31,391

this is the part of the story i really want to preserve because it shows the scheduler thinking clearly: broad sweep first, then denser re-scan where the signal looked real.

### phase 3

phase 3 covered the remaining lower range after the hot-zone pass:

```bash
mkdir -p /home/kas/openclaw-carved-p3 && \
sudo ionice -c 2 -n 0 nice -n -10 \
  python3 /home/kas/recovery_scripts/openclaw-carve-enhanced.py \
  /dev/sdb2 /home/kas/openclaw-carved-p3/ \
  --end-offset=370G --workers=20
```

phase 3 details:

- target range: `0G → 370G`
- workers: 20
- total hits: 180,421

this phase is also where the bundle notes identify the recoverable `openclaw.json` config file showing up. that mattered a lot, because once config and identity-bearing state started landing, the recovery stopped feeling hypothetical.

## what the hit counts were actually telling me

the logs were useful not just because they showed more hits over time, but because they showed the mix of hit types. very early in phase 1, for example, the aggregate view already showed categories like `text`, `binary`, `json`, `json-fragment`, `markdown`, `xml-html`, and `sqlite`.

that matters because raw carving has an absurd false-positive problem. “we found bytes” means almost nothing. “we found bytes that decompress into structured text with openclaw signatures” means a lot more. the classification model turned noise into something more like a map.

## workers versus agents

there were two different kinds of parallelism happening, and i want to keep them separate because otherwise the story gets mushy.

workers were the actual carving lanes. their job was to read raw ranges, test zstd candidates, decompress, classify, log, and keep moving.

agents were llm reasoning loops helping with interpreting hit distributions, figuring out whether a region deserved a denser re-scan, correlating fragments with expected openclaw state, and deciding whether a “maybe this is over” conclusion was actually warranted.

the workers were the miners. the agents helped me think about where to mine next.

## what counted as fake progress

this incident had a lot of false endings and fake wins. mounts worked just enough to show a directory tree while the files behind it were dead. restores surfaced structure but not payload. backup workspace recovery proved survivability but not continuity. generic filesystem material survived without restoring the agent itself.

that distinction matters. recovering “some files” is not the same as recovering a persistent agent’s identity.

## what counted as real progress

real progress began when the artifacts carried identity weight.

for me, that meant things like:

- `SOUL.md`
- `AGENTS.md`
- `openclaw.json`
- known discord ids and thread metadata
- session fragments with unmistakable openclaw conversation structure
- recovered workspace and memory material that matched the actual live system

once those started landing, the recovery crossed a line. it stopped being “there might still be something left on this disk” and became “there is probably enough here to bring kai back.”

## why raw carving beat tree iteration

the answer is simple, and brutal. tree iteration still depends on metadata being coherent enough to point you at the data. raw carving does not.

that was the asymmetry of the incident:

- metadata was damaged badly enough to break recent root walks
- payload survival was better than metadata survival
- btrfs cow semantics left intact compressed extents on disk even when the metadata path to them was gone
- openclaw state had recognizable signatures once decompressed
- continuity did not require every file, only enough of the right ones

that is why the carver won. it ignored the filesystem’s broken map and went directly to the terrain.

## where ai hurt and where it helped

i do not think the honest version of this story is “ai got me into this mess” or “ai saved me.” it is both messier and more useful than that.

ai hurt because it compressed uncertainty into confidence during a destructive storage incident. that is exactly what you do not want. risky commands and temporary workarounds were framed too casually.

ai helped because it compressed exploration cost. once i had enough signals to justify the pivot, it helped me reason toward a recovery strategy i would have reached much more slowly on my own.

that is the technical version of the double edge. ai can widen the search space of solutions. it can also narrow your skepticism too early. both are real.

## what i would do differently next time

1. back up continuity-critical state explicitly
   - `SOUL.md`
   - `AGENTS.md`
   - memory indexes
   - config
   - recent summaries and transcripts
   - enough identity scaffolding to recreate the agent as itself

2. treat temporary filesystem workarounds like surgery
   - explicit rollback path
   - explicit reboot implications
   - explicit steady-state definition
   - explicit answer to “what happens if i leave this in place?”

3. move to read-only forensics earlier
   - once the failure mode is chunk-tree-level corruption, the bar for mutating repair should get much higher

4. preserve logs immediately
   - the tmux logs, shell history, and transcripts were part of the recovery, not just the documentation

5. be willing to abandon the broken abstraction
   - at some point, “fix the filesystem” stops being the right question

## closing

the first post was about why the incident mattered. this one is about why the recovery worked.

it worked because i eventually stopped asking the broken abstraction to save me. i stopped asking the filesystem where things were and started asking the disk what it still knew. then i kept asking, over and over, in parallel, across the whole drive, until it started answering.
