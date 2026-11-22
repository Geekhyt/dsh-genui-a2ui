---- MODULE ChunkAndMermaidCache ----
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Keys, MaxCache

VARIABLES
  chunkState,
  subscribers,
  timerPending,
  inflight,
  cache,
  lruOrder

vars == <<chunkState, subscribers, timerPending, inflight, cache, lruOrder>>

ChunkStates == {"unloaded", "loading", "loaded", "failed"}
CacheStates == {"none", "ok", "error"}

SeqContains(seq, elem) == \E i \in 1..Len(seq) : seq[i] = elem

RemoveFromSeq(seq, elem) ==
  SelectSeq(seq, LAMBDA x : x # elem)

MoveToBack(seq, elem) ==
  Append(RemoveFromSeq(seq, elem), elem)

IdleVictimIndices(seq, subs, protectedKey) ==
  { i \in 1..Len(seq) : seq[i] # protectedKey /\ subs[seq[i]] = 0 }

RECURSIVE EvictIdle(_, _, _, _)
EvictIdle(seq, subs, protectedKey, limit) ==
  IF Len(seq) <= limit \/ IdleVictimIndices(seq, subs, protectedKey) = {}
  THEN seq
  ELSE LET idx == CHOOSE i \in IdleVictimIndices(seq, subs, protectedKey) :
                    \A j \in IdleVictimIndices(seq, subs, protectedKey) : i <= j
           victim == seq[idx]
       IN EvictIdle(RemoveFromSeq(seq, victim), subs, protectedKey, limit)

StoreCache(oldCache, oldLru, subs, k, newVal) ==
  LET promoted == MoveToBack(oldLru, k)
      trimmed == EvictIdle(promoted, subs, k, MaxCache)
      nextCache == [x \in Keys |->
                      IF x = k THEN newVal
                      ELSE IF SeqContains(trimmed, x) THEN oldCache[x]
                      ELSE "none"]
  IN [cache |-> nextCache, lru |-> trimmed]

TrimOnIdle(oldCache, oldLru, subs) ==
  LET trimmed == EvictIdle(oldLru, subs, "__none__", MaxCache)
      nextCache == [x \in Keys |-> IF SeqContains(trimmed, x) THEN oldCache[x] ELSE "none"]
  IN [cache |-> nextCache, lru |-> trimmed]

SnapshotOf(k) ==
  IF cache[k] = "none" THEN "pending" ELSE cache[k]

TypeOK ==
  /\ chunkState \in ChunkStates
  /\ subscribers \in [Keys -> 0..2]
  /\ timerPending \in [Keys -> BOOLEAN]
  /\ inflight \in [Keys -> BOOLEAN]
  /\ cache \in [Keys -> CacheStates]
  /\ lruOrder \in Seq(Keys)
  /\ Len(lruOrder) <= Cardinality(Keys)
  /\ \A i, j \in 1..Len(lruOrder) : i # j => lruOrder[i] # lruOrder[j]

Init ==
  /\ chunkState = "unloaded"
  /\ subscribers = [k \in Keys |-> 0]
  /\ timerPending = [k \in Keys |-> FALSE]
  /\ inflight = [k \in Keys |-> FALSE]
  /\ cache = [k \in Keys |-> "none"]
  /\ lruOrder = <<>>

Subscribe(k) ==
  /\ subscribers[k] < 2
  /\ LET nextSubs == [subscribers EXCEPT ![k] = @ + 1]
         wasError == cache[k] = "error" /\ ~inflight[k]
         needsSchedule ==
           (wasError \/ cache[k] = "none") /\ ~timerPending[k] /\ ~inflight[k]
     IN /\ subscribers' = nextSubs
        /\ cache' = IF wasError THEN [cache EXCEPT ![k] = "none"] ELSE cache
        /\ lruOrder' = IF wasError THEN RemoveFromSeq(lruOrder, k) ELSE lruOrder
        /\ timerPending' = IF needsSchedule THEN [timerPending EXCEPT ![k] = TRUE] ELSE timerPending
        /\ UNCHANGED <<chunkState, inflight>>

Unsubscribe(k) ==
  /\ subscribers[k] > 0
  /\ LET nextCount == subscribers[k] - 1
         nextSubs == [subscribers EXCEPT ![k] = nextCount]
         dropError == nextCount = 0 /\ cache[k] = "error"
         baseCache == IF dropError THEN [cache EXCEPT ![k] = "none"] ELSE cache
         baseLru == IF dropError THEN RemoveFromSeq(lruOrder, k) ELSE lruOrder
         trimmed ==
           IF nextCount = 0 /\ Len(baseLru) > MaxCache
           THEN TrimOnIdle(baseCache, baseLru, nextSubs)
           ELSE [cache |-> baseCache, lru |-> baseLru]
     IN /\ subscribers' = nextSubs
        /\ timerPending' =
             IF nextCount = 0 THEN [timerPending EXCEPT ![k] = FALSE] ELSE timerPending
        /\ cache' = trimmed.cache
        /\ lruOrder' = trimmed.lru
        /\ UNCHANGED <<chunkState, inflight>>

DebounceFire(k) ==
  /\ timerPending[k]
  /\ timerPending' = [timerPending EXCEPT ![k] = FALSE]
  /\ UNCHANGED <<subscribers, cache, lruOrder>>
  /\ IF subscribers[k] > 0 /\ ~inflight[k] /\ cache[k] # "ok"
     THEN /\ inflight' = [inflight EXCEPT ![k] = TRUE]
          /\ chunkState' = IF chunkState \in {"unloaded", "failed"} THEN "loading" ELSE chunkState
     ELSE UNCHANGED <<inflight, chunkState>>

ChunkLoadOk ==
  /\ chunkState = "loading"
  /\ chunkState' = "loaded"
  /\ UNCHANGED <<subscribers, timerPending, inflight, cache, lruOrder>>

SetToSeq(S) ==
  LET RECURSIVE Helper(_)
      Helper(rem) ==
        IF rem = {} THEN <<>>
        ELSE LET x == CHOOSE e \in rem : TRUE
             IN <<x>> \o Helper(rem \ {x})
  IN Helper(S)

ChunkLoadFail ==
  /\ chunkState = "loading"
  /\ chunkState' = "failed"
  /\ LET added == { k \in Keys : inflight[k] /\ subscribers[k] > 0 /\ ~SeqContains(lruOrder, k) }
         nextLru == EvictIdle(lruOrder \o SetToSeq(added), subscribers, "__none__", MaxCache)
         rawCache == [k \in Keys |->
                        IF inflight[k] /\ subscribers[k] > 0 THEN "error"
                        ELSE cache[k]]
     IN /\ inflight' = [k \in Keys |-> FALSE]
        /\ cache' = [x \in Keys |-> IF SeqContains(nextLru, x) THEN rawCache[x] ELSE "none"]
        /\ lruOrder' = nextLru
        /\ UNCHANGED <<subscribers, timerPending>>

RenderOk(k) ==
  /\ chunkState = "loaded"
  /\ inflight[k]
  /\ inflight' = [inflight EXCEPT ![k] = FALSE]
  /\ IF subscribers[k] > 0
     THEN LET stored == StoreCache(cache, lruOrder, subscribers, k, "ok")
          IN /\ cache' = stored.cache
             /\ lruOrder' = stored.lru
     ELSE UNCHANGED <<cache, lruOrder>>
  /\ UNCHANGED <<chunkState, subscribers, timerPending>>

RenderFail(k) ==
  /\ chunkState = "loaded"
  /\ inflight[k]
  /\ inflight' = [inflight EXCEPT ![k] = FALSE]
  /\ IF subscribers[k] > 0
     THEN LET stored == StoreCache(cache, lruOrder, subscribers, k, "error")
          IN /\ cache' = stored.cache
             /\ lruOrder' = stored.lru
     ELSE UNCHANGED <<cache, lruOrder>>
  /\ UNCHANGED <<chunkState, subscribers, timerPending>>

RetryKey(k) ==
  /\ subscribers[k] > 0
  /\ cache[k] = "error"
  /\ ~inflight[k]
  /\ ~timerPending[k]
  /\ cache' = [cache EXCEPT ![k] = "none"]
  /\ lruOrder' = RemoveFromSeq(lruOrder, k)
  /\ timerPending' = [timerPending EXCEPT ![k] = TRUE]
  /\ UNCHANGED <<chunkState, subscribers, inflight>>

Next ==
  \/ \E k \in Keys : Subscribe(k)
  \/ \E k \in Keys : Unsubscribe(k)
  \/ \E k \in Keys : DebounceFire(k)
  \/ ChunkLoadOk
  \/ ChunkLoadFail
  \/ \E k \in Keys : RenderOk(k)
  \/ \E k \in Keys : RenderFail(k)
  \/ \E k \in Keys : RetryKey(k)

Fairness ==
  /\ \A k \in Keys : WF_vars(DebounceFire(k))
  /\ WF_vars(ChunkLoadOk \/ ChunkLoadFail)
  /\ \A k \in Keys : WF_vars(RenderOk(k) \/ RenderFail(k))

Spec == Init /\ [][Next]_vars /\ Fairness

CacheAndLruConsistent ==
  \A k \in Keys : (cache[k] # "none") <=> SeqContains(lruOrder, k)

NoOrphanErrorPoisoning ==
  \A k \in Keys : subscribers[k] = 0 => cache[k] # "error"

ActiveSubscribersNeverEvicted ==
  \A k \in Keys :
    (subscribers[k] > 0 /\ cache[k] = "ok") => SeqContains(lruOrder, k)

NoPermanentSkeletonWithoutWork ==
  \A k \in Keys :
    (subscribers[k] > 0 /\ SnapshotOf(k) = "pending") => (timerPending[k] \/ inflight[k])

BoundedIdleCache ==
  Len(lruOrder) > MaxCache => (\A i \in 1..Len(lruOrder) : subscribers[lruOrder[i]] > 0)

PendingEventuallyResolves ==
  \A k \in Keys : []((subscribers[k] > 0 /\ SnapshotOf(k) = "pending") => <>(subscribers[k] = 0 \/ SnapshotOf(k) # "pending"))

====
