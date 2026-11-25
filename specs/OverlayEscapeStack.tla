---- MODULE OverlayEscapeStack ----
EXTENDS Naturals, Sequences, FiniteSets

VARIABLES
  stack,
  globalListenerAttached,
  focusOwner,
  formValid,
  triggerVisible,
  lastAction

vars ==
  <<stack, globalListenerAttached, focusOwner, formValid, triggerVisible, lastAction>>

Layers == {"modal", "popover", "fullscreen"}
FocusTargets == {"page"} \cup Layers
Actions == {"none", "open", "escape", "local", "submit", "scroll", "toggle"}

SeqContains(seq, elem) == \E i \in 1..Len(seq) : seq[i] = elem

RemoveFromSeq(seq, elem) ==
  SelectSeq(seq, LAMBDA x : x # elem)

TopOrPage(seq) ==
  IF Len(seq) = 0 THEN "page" ELSE seq[Len(seq)]

TypeOK ==
  /\ stack \in Seq(Layers)
  /\ Len(stack) <= Cardinality(Layers)
  /\ globalListenerAttached \in BOOLEAN
  /\ focusOwner \in FocusTargets
  /\ formValid \in BOOLEAN
  /\ triggerVisible \in BOOLEAN
  /\ lastAction \in Actions

Init ==
  /\ stack = <<>>
  /\ globalListenerAttached = FALSE
  /\ focusOwner = "page"
  /\ formValid = FALSE
  /\ triggerVisible = TRUE
  /\ lastAction = "none"

OpenModal ==
  /\ ~SeqContains(stack, "modal")
  /\ LET next == Append(stack, "modal")
     IN /\ stack' = next
        /\ globalListenerAttached' = TRUE
        /\ focusOwner' = TopOrPage(next)
        /\ lastAction' = "open"
        /\ UNCHANGED <<formValid, triggerVisible>>

OpenPopover ==
  /\ triggerVisible
  /\ ~SeqContains(stack, "popover")
  /\ LET next == Append(stack, "popover")
     IN /\ stack' = next
        /\ globalListenerAttached' = TRUE
        /\ focusOwner' = TopOrPage(next)
        /\ lastAction' = "open"
        /\ UNCHANGED <<formValid, triggerVisible>>

OpenFullscreen ==
  /\ ~SeqContains(stack, "fullscreen")
  /\ LET next == Append(stack, "fullscreen")
     IN /\ stack' = next
        /\ globalListenerAttached' = TRUE
        /\ focusOwner' = TopOrPage(next)
        /\ lastAction' = "open"
        /\ UNCHANGED <<formValid, triggerVisible>>

PressEscape ==
  /\ Len(stack) > 0
  /\ LET next == SubSeq(stack, 1, Len(stack) - 1)
     IN /\ stack' = next
        /\ globalListenerAttached' = (Len(next) > 0)
        /\ focusOwner' = TopOrPage(next)
        /\ lastAction' = "escape"
        /\ UNCHANGED <<formValid, triggerVisible>>

TriggerLocalFunctionAction ==
  /\ SeqContains(stack, "modal")
  /\ lastAction' = "local"
  /\ UNCHANGED <<stack, globalListenerAttached, focusOwner, formValid, triggerVisible>>

SubmitInModal ==
  /\ Len(stack) > 0
  /\ stack[Len(stack)] = "modal"
  /\ IF formValid
     THEN LET next == SubSeq(stack, 1, Len(stack) - 1)
          IN /\ stack' = next
             /\ globalListenerAttached' = (Len(next) > 0)
             /\ focusOwner' = TopOrPage(next)
     ELSE UNCHANGED <<stack, globalListenerAttached, focusOwner>>
  /\ lastAction' = "submit"
  /\ UNCHANGED <<formValid, triggerVisible>>

ScrollTriggerOutOfView ==
  /\ triggerVisible
  /\ triggerVisible' = FALSE
  /\ LET next == RemoveFromSeq(stack, "popover")
     IN /\ stack' = next
        /\ globalListenerAttached' = (Len(next) > 0)
        /\ focusOwner' = TopOrPage(next)
        /\ lastAction' = "scroll"
        /\ UNCHANGED <<formValid>>

ScrollTriggerIntoView ==
  /\ ~triggerVisible
  /\ triggerVisible' = TRUE
  /\ lastAction' = "scroll"
  /\ UNCHANGED <<stack, globalListenerAttached, focusOwner, formValid>>

ToggleFormValid ==
  /\ formValid' = ~formValid
  /\ lastAction' = "toggle"
  /\ UNCHANGED <<stack, globalListenerAttached, focusOwner, triggerVisible>>

Next ==
  \/ OpenModal
  \/ OpenPopover
  \/ OpenFullscreen
  \/ PressEscape
  \/ TriggerLocalFunctionAction
  \/ SubmitInModal
  \/ ScrollTriggerOutOfView
  \/ ScrollTriggerIntoView
  \/ ToggleFormValid

Fairness ==
  WF_vars(PressEscape)

Spec == Init /\ [][Next]_vars /\ Fairness

NoDuplicateLayers ==
  \A i, j \in 1..Len(stack) : i # j => stack[i] # stack[j]

ListenerMatchesNonEmptyStack ==
  globalListenerAttached <=> (Len(stack) > 0)

FocusMatchesTopLayer ==
  focusOwner = TopOrPage(stack)

LocalActionNeverClosesModal ==
  (lastAction = "local") => SeqContains(stack, "modal")

HiddenTriggerNeverHoldsPopover ==
  ~triggerVisible => ~SeqContains(stack, "popover")

EscapeCanAlwaysDrain ==
  [](Len(stack) = Cardinality(Layers) => <>(Len(stack) < Cardinality(Layers)))

====
