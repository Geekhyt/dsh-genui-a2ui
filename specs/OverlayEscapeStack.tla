---- MODULE OverlayEscapeStack ----
EXTENDS Naturals, Sequences, FiniteSets

VARIABLES
  stack,
  globalListenerAttached,
  focusOwner,
  formValid,
  triggerVisible,
  localActionClosedModal

vars ==
  <<stack, globalListenerAttached, focusOwner, formValid, triggerVisible, localActionClosedModal>>

Layers == {"modal", "popover", "fullscreen"}
FocusTargets == {"page"} \cup Layers

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
  /\ localActionClosedModal \in BOOLEAN

Init ==
  /\ stack = <<>>
  /\ globalListenerAttached = FALSE
  /\ focusOwner = "page"
  /\ formValid = FALSE
  /\ triggerVisible = TRUE
  /\ localActionClosedModal = FALSE

OpenModal ==
  /\ ~SeqContains(stack, "modal")
  /\ LET next == Append(stack, "modal")
     IN /\ stack' = next
        /\ globalListenerAttached' = TRUE
        /\ focusOwner' = TopOrPage(next)
        /\ UNCHANGED <<formValid, triggerVisible, localActionClosedModal>>

OpenPopover ==
  /\ triggerVisible
  /\ ~SeqContains(stack, "popover")
  /\ LET next == Append(stack, "popover")
     IN /\ stack' = next
        /\ globalListenerAttached' = TRUE
        /\ focusOwner' = TopOrPage(next)
        /\ UNCHANGED <<formValid, triggerVisible, localActionClosedModal>>

OpenFullscreen ==
  /\ ~SeqContains(stack, "fullscreen")
  /\ LET next == Append(stack, "fullscreen")
     IN /\ stack' = next
        /\ globalListenerAttached' = TRUE
        /\ focusOwner' = TopOrPage(next)
        /\ UNCHANGED <<formValid, triggerVisible, localActionClosedModal>>

PressEscape ==
  /\ Len(stack) > 0
  /\ LET next == SubSeq(stack, 1, Len(stack) - 1)
     IN /\ stack' = next
        /\ globalListenerAttached' = (Len(next) > 0)
        /\ focusOwner' = TopOrPage(next)
        /\ UNCHANGED <<formValid, triggerVisible, localActionClosedModal>>

TriggerLocalFunctionAction ==
  /\ SeqContains(stack, "modal")
  /\ UNCHANGED vars

SubmitInModal ==
  /\ Len(stack) > 0
  /\ stack[Len(stack)] = "modal"
  /\ IF formValid
     THEN LET next == SubSeq(stack, 1, Len(stack) - 1)
          IN /\ stack' = next
             /\ globalListenerAttached' = (Len(next) > 0)
             /\ focusOwner' = TopOrPage(next)
     ELSE UNCHANGED <<stack, globalListenerAttached, focusOwner>>
  /\ UNCHANGED <<formValid, triggerVisible, localActionClosedModal>>

ScrollTriggerOutOfView ==
  /\ triggerVisible
  /\ triggerVisible' = FALSE
  /\ LET next == RemoveFromSeq(stack, "popover")
     IN /\ stack' = next
        /\ globalListenerAttached' = (Len(next) > 0)
        /\ focusOwner' = TopOrPage(next)
        /\ UNCHANGED <<formValid, localActionClosedModal>>

ScrollTriggerIntoView ==
  /\ ~triggerVisible
  /\ triggerVisible' = TRUE
  /\ UNCHANGED <<stack, globalListenerAttached, focusOwner, formValid, localActionClosedModal>>

ToggleFormValid ==
  /\ formValid' = ~formValid
  /\ UNCHANGED <<stack, globalListenerAttached, focusOwner, triggerVisible, localActionClosedModal>>

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
  ~localActionClosedModal

HiddenTriggerNeverHoldsPopover ==
  ~triggerVisible => ~SeqContains(stack, "popover")

EscapeCanAlwaysDrain ==
  [](Len(stack) > 0 => <>(Len(stack) = 0 \/ Len(stack) < 3))

====
