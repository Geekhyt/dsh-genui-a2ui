---- MODULE SurfaceTurnLifecycle ----
EXTENDS Naturals, FiniteSets

CONSTANTS Surfaces, MaxTurns

VARIABLES
  turn,
  streamState,
  errorTripped,
  boundaryGen,
  surfacePlacement,
  turnVisible,
  turnSuperseded,
  dockVisible,
  draftState

vars ==
  <<turn, streamState, errorTripped, boundaryGen, surfacePlacement,
    turnVisible, turnSuperseded, dockVisible, draftState>>

Turns == 1..MaxTurns
StreamStates == {"idle", "streaming", "rejected", "closed"}
Placements == {"none", "answer", "dock", "deleted"}
DraftStates == {"empty", "dirty", "saved"}

NonEmptySurfaceSubsets == (SUBSET Surfaces) \ {{}}

TypeOK ==
  /\ turn \in 0..MaxTurns
  /\ streamState \in StreamStates
  /\ errorTripped \in BOOLEAN
  /\ boundaryGen \in 0..(MaxTurns + 3)
  /\ surfacePlacement \in [Surfaces -> Placements]
  /\ turnVisible \in [Turns -> SUBSET Surfaces]
  /\ turnSuperseded \in [Turns -> SUBSET Surfaces]
  /\ dockVisible \subseteq Surfaces
  /\ draftState \in [Surfaces -> DraftStates]

Init ==
  /\ turn = 0
  /\ streamState = "idle"
  /\ errorTripped = FALSE
  /\ boundaryGen = 0
  /\ surfacePlacement = [s \in Surfaces |-> "none"]
  /\ turnVisible = [t \in Turns |-> {}]
  /\ turnSuperseded = [t \in Turns |-> {}]
  /\ dockVisible = {}
  /\ draftState = [s \in Surfaces |-> "empty"]

StreamStart ==
  /\ turn < MaxTurns
  /\ streamState \in {"idle", "closed"}
  /\ streamState' = "streaming"
  /\ errorTripped' = FALSE
  /\ UNCHANGED <<turn, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible, draftState>>

StreamReject ==
  /\ streamState = "streaming"
  /\ streamState' = "rejected"
  /\ errorTripped' = TRUE
  /\ UNCHANGED <<turn, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible, draftState>>

StreamSelfHeal ==
  /\ streamState = "rejected"
  /\ boundaryGen < MaxTurns + 2
  /\ streamState' = "streaming"
  /\ errorTripped' = FALSE
  /\ boundaryGen' = boundaryGen + 1
  /\ UNCHANGED <<turn, surfacePlacement, turnVisible, turnSuperseded, dockVisible, draftState>>

StreamAbortToClosed ==
  /\ streamState = "rejected"
  /\ streamState' = "closed"
  /\ UNCHANGED <<turn, errorTripped, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible, draftState>>

CommitAnswerTurn(targets) ==
  /\ turn < MaxTurns
  /\ streamState = "streaming"
  /\ LET nextT == turn + 1
         answerVisible == { s \in targets : surfacePlacement[s] # "dock" }
     IN /\ turn' = nextT
        /\ streamState' = "closed"
        /\ errorTripped' = FALSE
        /\ surfacePlacement' =
             [s \in Surfaces |->
                IF s \in targets /\ surfacePlacement[s] # "dock"
                THEN "answer"
                ELSE surfacePlacement[s]]
        /\ turnVisible' = [turnVisible EXCEPT ![nextT] = answerVisible]
        /\ turnSuperseded' =
             [t \in Turns |->
                IF t < nextT
                THEN turnSuperseded[t] \cup (turnVisible[t] \cap targets)
                ELSE turnSuperseded[t]]
        /\ UNCHANGED <<boundaryGen, dockVisible, draftState>>

CommitDockTurn(targets) ==
  /\ turn < MaxTurns
  /\ streamState = "streaming"
  /\ LET nextT == turn + 1
     IN /\ turn' = nextT
        /\ streamState' = "closed"
        /\ errorTripped' = FALSE
        /\ surfacePlacement' =
             [s \in Surfaces |-> IF s \in targets THEN "dock" ELSE surfacePlacement[s]]
        /\ dockVisible' = dockVisible \cup targets
        /\ turnVisible' = [turnVisible EXCEPT ![nextT] = {}]
        /\ turnSuperseded' =
             [t \in Turns |->
                IF t < nextT
                THEN turnSuperseded[t] \cup (turnVisible[t] \cap targets)
                ELSE turnSuperseded[t]]
        /\ UNCHANGED <<boundaryGen, draftState>>

DeleteSurface(s) ==
  /\ surfacePlacement[s] \in {"answer", "dock"}
  /\ surfacePlacement' = [surfacePlacement EXCEPT ![s] = "deleted"]
  /\ dockVisible' = dockVisible \ {s}
  /\ draftState' = [draftState EXCEPT ![s] = "empty"]
  /\ UNCHANGED <<turn, streamState, errorTripped, boundaryGen, turnVisible, turnSuperseded>>

EditDraft(s) ==
  /\ surfacePlacement[s] \in {"answer", "dock"}
  /\ draftState[s] # "dirty"
  /\ draftState' = [draftState EXCEPT ![s] = "dirty"]
  /\ UNCHANGED <<turn, streamState, errorTripped, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible>>

FlushDraft(s) ==
  /\ draftState[s] = "dirty"
  /\ draftState' = [draftState EXCEPT ![s] = "saved"]
  /\ UNCHANGED <<turn, streamState, errorTripped, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible>>

StutterAtEnd ==
  /\ turn = MaxTurns
  /\ streamState = "closed"
  /\ UNCHANGED vars

Next ==
  \/ StreamStart
  \/ StreamReject
  \/ StreamSelfHeal
  \/ StreamAbortToClosed
  \/ \E targets \in NonEmptySurfaceSubsets : CommitAnswerTurn(targets)
  \/ \E targets \in NonEmptySurfaceSubsets : CommitDockTurn(targets)
  \/ \E s \in Surfaces : DeleteSurface(s)
  \/ \E s \in Surfaces : EditDraft(s)
  \/ \E s \in Surfaces : FlushDraft(s)
  \/ StutterAtEnd

Fairness ==
  /\ WF_vars(StreamSelfHeal)
  /\ \A s \in Surfaces : WF_vars(FlushDraft(s))

Spec == Init /\ [][Next]_vars /\ Fairness

DeletedNeverInDock ==
  \A s \in Surfaces : surfacePlacement[s] = "deleted" => s \notin dockVisible

DockVisibleMatchesPlacement ==
  \A s \in Surfaces : (s \in dockVisible) <=> (surfacePlacement[s] = "dock")

PartialSupersedeSubsetOfVisible ==
  \A t \in Turns : turnSuperseded[t] \subseteq turnVisible[t]

FutureTurnsRemainEmpty ==
  \A t \in Turns : t > turn => (turnVisible[t] = {} /\ turnSuperseded[t] = {})

HealthyStreamClearsErrorBoundary ==
  streamState = "streaming" => ~errorTripped

DeletedHasNoDraft ==
  \A s \in Surfaces : surfacePlacement[s] = "deleted" => draftState[s] = "empty"

DirtyDraftEventuallyFlushesOrClears ==
  \A s \in Surfaces : [](draftState[s] = "dirty" => <>(draftState[s] # "dirty"))

====
