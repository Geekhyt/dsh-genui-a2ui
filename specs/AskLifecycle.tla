---- MODULE AskLifecycle ----
EXTENDS Naturals, FiniteSets

CONSTANTS Calls

VARIABLES
  callState,
  activePending,
  uiState,
  inFlight,
  settledCount,
  settledWithSecret,
  redactedOnSettle,
  sessionAlive

vars ==
  <<callState, activePending, uiState, inFlight, settledCount, settledWithSecret, redactedOnSettle, sessionAlive>>

TerminalStates == {"answered", "skipped", "timed_out", "aborted", "superseded", "disposed"}
CallStates == {"idle", "waiting"} \cup TerminalStates
UiStates == {"hidden", "open", "submitting", "done"}
ReplyKinds == {"answer", "skip"}

ReplyMessages == [callId: Calls, kind: ReplyKinds, hasSecret: BOOLEAN]

HasInFlightFor(c) == \E m \in inFlight : m.callId = c

TypeOK ==
  /\ callState \in [Calls -> CallStates]
  /\ activePending \subseteq Calls
  /\ uiState \in [Calls -> UiStates]
  /\ inFlight \subseteq ReplyMessages
  /\ settledCount \in [Calls -> 0..2]
  /\ settledWithSecret \subseteq Calls
  /\ redactedOnSettle \subseteq Calls
  /\ sessionAlive \in BOOLEAN

Init ==
  /\ callState = [c \in Calls |-> "idle"]
  /\ activePending = {}
  /\ uiState = [c \in Calls |-> "hidden"]
  /\ inFlight = {}
  /\ settledCount = [c \in Calls |-> 0]
  /\ settledWithSecret = {}
  /\ redactedOnSettle = {}
  /\ sessionAlive = TRUE

StartAsk(c) ==
  /\ sessionAlive
  /\ callState[c] = "idle"
  /\ callState' = [callState EXCEPT ![c] = "waiting"]
  /\ activePending' = activePending \cup {c}
  /\ uiState' = [uiState EXCEPT ![c] = "open"]
  /\ UNCHANGED <<inFlight, settledCount, settledWithSecret, redactedOnSettle, sessionAlive>>

SupersedeDuplicateCall(c) ==
  /\ sessionAlive
  /\ c \in activePending
  /\ callState[c] = "waiting"
  /\ callState' = [callState EXCEPT ![c] = "superseded"]
  /\ activePending' = activePending \ {c}
  /\ uiState' = [uiState EXCEPT ![c] = "done"]
  /\ settledCount' = [settledCount EXCEPT ![c] = @ + 1]
  /\ UNCHANGED <<inFlight, settledWithSecret, redactedOnSettle, sessionAlive>>

UserSubmit(c, kind, hasSecret) ==
  /\ sessionAlive
  /\ uiState[c] = "open"
  /\ ~HasInFlightFor(c)
  /\ uiState' = [uiState EXCEPT ![c] = "submitting"]
  /\ inFlight' = inFlight \cup {[callId |-> c, kind |-> kind, hasSecret |-> hasSecret]}
  /\ UNCHANGED <<callState, activePending, settledCount, settledWithSecret, redactedOnSettle, sessionAlive>>

DispatchFailRollback(m) ==
  /\ m \in inFlight
  /\ inFlight' = inFlight \ {m}
  /\ uiState' =
       IF uiState[m.callId] = "submitting" /\ callState[m.callId] = "waiting"
       THEN [uiState EXCEPT ![m.callId] = "open"]
       ELSE uiState
  /\ UNCHANGED <<callState, activePending, settledCount, settledWithSecret, redactedOnSettle, sessionAlive>>

ServerSettle(m) ==
  /\ m \in inFlight
  /\ inFlight' = inFlight \ {m}
  /\ IF m.callId \in activePending
     THEN /\ callState' =
               [callState EXCEPT ![m.callId] = IF m.kind = "skip" THEN "skipped" ELSE "answered"]
          /\ activePending' = activePending \ {m.callId}
          /\ settledCount' = [settledCount EXCEPT ![m.callId] = @ + 1]
          /\ settledWithSecret' =
               IF m.hasSecret THEN settledWithSecret \cup {m.callId} ELSE settledWithSecret
          /\ redactedOnSettle' =
               IF m.hasSecret THEN redactedOnSettle \cup {m.callId} ELSE redactedOnSettle
          /\ UNCHANGED <<uiState>>
     ELSE /\ UNCHANGED <<callState, activePending, settledCount, settledWithSecret, redactedOnSettle, uiState>>
  /\ UNCHANGED <<sessionAlive>>

TimeoutFire(c) ==
  /\ c \in activePending
  /\ callState' = [callState EXCEPT ![c] = "timed_out"]
  /\ activePending' = activePending \ {c}
  /\ settledCount' = [settledCount EXCEPT ![c] = @ + 1]
  /\ UNCHANGED <<uiState, inFlight, settledWithSecret, redactedOnSettle, sessionAlive>>

AbortCall(c) ==
  /\ c \in activePending
  /\ callState' = [callState EXCEPT ![c] = "aborted"]
  /\ activePending' = activePending \ {c}
  /\ settledCount' = [settledCount EXCEPT ![c] = @ + 1]
  /\ UNCHANGED <<uiState, inFlight, settledWithSecret, redactedOnSettle, sessionAlive>>

DisposeSession ==
  /\ sessionAlive
  /\ sessionAlive' = FALSE
  /\ callState' =
       [c \in Calls |-> IF c \in activePending THEN "disposed" ELSE callState[c]]
  /\ settledCount' =
       [c \in Calls |-> IF c \in activePending THEN settledCount[c] + 1 ELSE settledCount[c]]
  /\ activePending' = {}
  /\ UNCHANGED <<uiState, inFlight, settledWithSecret, redactedOnSettle>>

SyncUiTerminal(c) ==
  /\ callState[c] \in TerminalStates
  /\ uiState[c] # "done"
  /\ uiState' = [uiState EXCEPT ![c] = "done"]
  /\ UNCHANGED <<callState, activePending, inFlight, settledCount, settledWithSecret, redactedOnSettle, sessionAlive>>

StutterDone ==
  /\ ~sessionAlive
  /\ inFlight = {}
  /\ \A c \in Calls : callState[c] \in TerminalStates => uiState[c] = "done"
  /\ UNCHANGED vars

Next ==
  \/ \E c \in Calls : StartAsk(c)
  \/ \E c \in Calls : SupersedeDuplicateCall(c)
  \/ \E c \in Calls, k \in ReplyKinds, s \in BOOLEAN : UserSubmit(c, k, s)
  \/ \E m \in inFlight : DispatchFailRollback(m)
  \/ \E m \in inFlight : ServerSettle(m)
  \/ \E c \in Calls : TimeoutFire(c)
  \/ \E c \in Calls : AbortCall(c)
  \/ DisposeSession
  \/ \E c \in Calls : SyncUiTerminal(c)
  \/ StutterDone

Fairness ==
  /\ \A c \in Calls : WF_vars(TimeoutFire(c))
  /\ \A c \in Calls : WF_vars(SyncUiTerminal(c))
  /\ \A m \in ReplyMessages : WF_vars(ServerSettle(m))

Spec == Init /\ [][Next]_vars /\ Fairness

AtMostOnceSettlement ==
  \A c \in Calls : settledCount[c] <= 1

ActivePendingMatchesWaiting ==
  \A c \in Calls : (c \in activePending) <=> (callState[c] = "waiting")

NoDanglingPendingAfterDispose ==
  ~sessionAlive => activePending = {}

NoSecretLeak ==
  settledWithSecret \subseteq redactedOnSettle

NoReopenAfterSettle ==
  \A c \in Calls :
    callState[c] \in {"answered", "skipped"} => uiState[c] \in {"submitting", "done"}

NoStuckSubmittingWhileWaiting ==
  \A c \in Calls :
    (uiState[c] = "submitting" /\ callState[c] = "waiting") => HasInFlightFor(c)

EveryWaitingEventuallyResolves ==
  \A c \in Calls : [](callState[c] = "waiting" => <>(callState[c] # "waiting"))

UiNeverStuckSubmitting ==
  \A c \in Calls : [](uiState[c] = "submitting" => <>(uiState[c] # "submitting"))

====
