---- MODULE SurfaceTurnLifecycle ----
EXTENDS Naturals, FiniteSets

CONSTANTS Surfaces, MaxTurns

VARIABLES
  turn,
  sessionEpoch,
  streamState,
  errorTripped,
  widgetErrorTripped,
  boundaryGen,
  surfacePlacement,
  turnVisible,
  turnSuperseded,
  dockVisible,
  draftState,
  draftEpoch

vars ==
  <<turn, sessionEpoch, streamState, errorTripped, widgetErrorTripped, boundaryGen, surfacePlacement,
    turnVisible, turnSuperseded, dockVisible, draftState, draftEpoch>>

Turns == 1..MaxTurns
StreamStates == {"idle", "streaming", "rejected", "closed"}
Placements == {"none", "answer", "dock", "deleted"}
DraftStates == {"empty", "dirty", "saved"}

NonEmptySurfaceSubsets == (SUBSET Surfaces) \ {{}}

TypeOK ==
  /\ turn \in 0..MaxTurns
  /\ sessionEpoch \in 1..2
  /\ streamState \in StreamStates
  /\ errorTripped \in BOOLEAN
  /\ widgetErrorTripped \in [Surfaces -> BOOLEAN]
  /\ boundaryGen \in 0..(MaxTurns + 3)
  /\ surfacePlacement \in [Surfaces -> Placements]
  /\ turnVisible \in [Turns -> SUBSET Surfaces]
  /\ turnSuperseded \in [Turns -> SUBSET Surfaces]
  /\ dockVisible \subseteq Surfaces
  /\ draftState \in [Surfaces -> DraftStates]
  /\ draftEpoch \in [Surfaces -> 0..2]

Init ==
  /\ turn = 0
  /\ sessionEpoch = 1
  /\ streamState = "idle"
  /\ errorTripped = FALSE
  /\ widgetErrorTripped = [s \in Surfaces |-> FALSE]
  /\ boundaryGen = 0
  /\ surfacePlacement = [s \in Surfaces |-> "none"]
  /\ turnVisible = [t \in Turns |-> {}]
  /\ turnSuperseded = [t \in Turns |-> {}]
  /\ dockVisible = {}
  /\ draftState = [s \in Surfaces |-> "empty"]
  /\ draftEpoch = [s \in Surfaces |-> 0]

StreamStart ==
  /\ turn < MaxTurns
  /\ streamState \in {"idle", "closed"}
  /\ streamState' = "streaming"
  /\ errorTripped' = FALSE
  /\ widgetErrorTripped' = [s \in Surfaces |-> FALSE]
  /\ UNCHANGED <<turn, sessionEpoch, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible, draftState, draftEpoch>>

StreamReject ==
  /\ streamState = "streaming"
  /\ streamState' = "rejected"
  /\ errorTripped' = TRUE
  /\ UNCHANGED <<turn, sessionEpoch, widgetErrorTripped, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible, draftState, draftEpoch>>

StreamSelfHeal ==
  /\ streamState = "rejected"
  /\ boundaryGen < MaxTurns + 2
  /\ streamState' = "streaming"
  /\ errorTripped' = FALSE
  /\ widgetErrorTripped' = [s \in Surfaces |-> FALSE]
  /\ boundaryGen' = boundaryGen + 1
  /\ UNCHANGED <<turn, sessionEpoch, surfacePlacement, turnVisible, turnSuperseded, dockVisible, draftState, draftEpoch>>

StreamAbortToClosed ==
  /\ streamState = "rejected"
  /\ streamState' = "closed"
  /\ errorTripped' = FALSE
  /\ widgetErrorTripped' = [s \in Surfaces |-> FALSE]
  /\ UNCHANGED <<turn, sessionEpoch, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible, draftState, draftEpoch>>

CommitAnswerTurn(targets) ==
  /\ turn < MaxTurns
  /\ streamState = "streaming"
  /\ LET nextT == turn + 1
         answerVisible == { s \in targets : surfacePlacement[s] # "dock" }
     IN /\ turn' = nextT
        /\ streamState' = "closed"
        /\ errorTripped' = FALSE
        /\ widgetErrorTripped' = [s \in Surfaces |-> FALSE]
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
        /\ UNCHANGED <<sessionEpoch, boundaryGen, dockVisible, draftState, draftEpoch>>

CommitDockTurn(targets) ==
  /\ turn < MaxTurns
  /\ streamState = "streaming"
  /\ LET nextT == turn + 1
     IN /\ turn' = nextT
        /\ streamState' = "closed"
        /\ errorTripped' = FALSE
        /\ widgetErrorTripped' = [s \in Surfaces |-> FALSE]
        /\ surfacePlacement' =
             [s \in Surfaces |-> IF s \in targets THEN "dock" ELSE surfacePlacement[s]]
        /\ dockVisible' = dockVisible \cup targets
        /\ turnVisible' = [turnVisible EXCEPT ![nextT] = {}]
        /\ turnSuperseded' =
             [t \in Turns |->
                IF t < nextT
                THEN turnSuperseded[t] \cup (turnVisible[t] \cap targets)
                ELSE turnSuperseded[t]]
        /\ UNCHANGED <<sessionEpoch, boundaryGen, draftState, draftEpoch>>

WidgetRenderFail(s) ==
  /\ ~errorTripped
  /\ surfacePlacement[s] \in {"answer", "dock"}
  /\ ~widgetErrorTripped[s]
  /\ widgetErrorTripped' = [widgetErrorTripped EXCEPT ![s] = TRUE]
  /\ UNCHANGED <<turn, sessionEpoch, streamState, errorTripped, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible, draftState, draftEpoch>>

DeleteSurface(s) ==
  /\ surfacePlacement[s] \in {"answer", "dock"}
  /\ surfacePlacement' = [surfacePlacement EXCEPT ![s] = "deleted"]
  /\ dockVisible' = dockVisible \ {s}
  /\ draftState' = [draftState EXCEPT ![s] = "empty"]
  /\ draftEpoch' = [draftEpoch EXCEPT ![s] = 0]
  /\ widgetErrorTripped' = [widgetErrorTripped EXCEPT ![s] = FALSE]
  /\ UNCHANGED <<turn, sessionEpoch, streamState, errorTripped, boundaryGen, turnVisible, turnSuperseded>>

EditDraft(s) ==
  /\ surfacePlacement[s] \in {"answer", "dock"}
  /\ draftState[s] # "dirty"
  /\ draftState' = [draftState EXCEPT ![s] = "dirty"]
  /\ draftEpoch' = [draftEpoch EXCEPT ![s] = sessionEpoch]
  /\ UNCHANGED <<turn, sessionEpoch, streamState, errorTripped, widgetErrorTripped, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible>>

FlushDraft(s) ==
  /\ draftState[s] = "dirty"
  /\ draftState' = [draftState EXCEPT ![s] = "saved"]
  /\ UNCHANGED <<turn, sessionEpoch, streamState, errorTripped, widgetErrorTripped, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible, draftEpoch>>

SwitchSession ==
  /\ sessionEpoch < 2
  /\ streamState \in {"idle", "closed"}
  /\ sessionEpoch' = sessionEpoch + 1
  /\ draftState' = [s \in Surfaces |-> IF draftState[s] = "dirty" THEN "saved" ELSE draftState[s]]
  /\ UNCHANGED <<turn, streamState, errorTripped, widgetErrorTripped, boundaryGen, surfacePlacement, turnVisible, turnSuperseded, dockVisible, draftEpoch>>

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
  \/ \E s \in Surfaces : WidgetRenderFail(s)
  \/ \E s \in Surfaces : DeleteSurface(s)
  \/ \E s \in Surfaces : EditDraft(s)
  \/ \E s \in Surfaces : FlushDraft(s)
  \/ SwitchSession
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

WidgetErrorIsolatedFromRoot ==
  \A s \in Surfaces : (widgetErrorTripped[s] /\ streamState # "rejected") => ~errorTripped

DeletedHasNoWidgetError ==
  \A s \in Surfaces : surfacePlacement[s] = "deleted" => ~widgetErrorTripped[s]

DeletedHasNoDraft ==
  \A s \in Surfaces : surfacePlacement[s] = "deleted" => draftState[s] = "empty"

NoCrossSessionDirtyDraft ==
  \A s \in Surfaces : draftState[s] = "dirty" => draftEpoch[s] = sessionEpoch

DirtyDraftEventuallyFlushesOrClears ==
  \A s \in Surfaces : [](draftState[s] = "dirty" => <>(draftState[s] # "dirty"))

====
