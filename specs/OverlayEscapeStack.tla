---- MODULE OverlayEscapeStack ----
EXTENDS Naturals, Sequences, FiniteSets

VARIABLES
  stack,
  globalListenerAttached,
  focusOwner,
  hostOverlayOpen,
  focusInUnmanagedHost,
  formValid,
  triggerVisible,
  lastAction

vars ==
  <<stack, globalListenerAttached, focusOwner, hostOverlayOpen, focusInUnmanagedHost, formValid, triggerVisible, lastAction>>

Layers == {"modal", "popover", "fullscreen"}
FocusTargets == {"page", "host"} \cup Layers
Actions == {
  "none",
  "open",
  "escape",
  "host_open",
  "host_focus",
  "host_close",
  "host_escape",
  "tab_portal",
  "local",
  "submit",
  "scroll",
  "toggle"
}

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
  /\ hostOverlayOpen \in BOOLEAN
  /\ focusInUnmanagedHost \in BOOLEAN
  /\ formValid \in BOOLEAN
  /\ triggerVisible \in BOOLEAN
  /\ lastAction \in Actions

Init ==
  /\ stack = <<>>
  /\ globalListenerAttached = FALSE
  /\ focusOwner = "page"
  /\ hostOverlayOpen = FALSE
  /\ focusInUnmanagedHost = FALSE
  /\ formValid = FALSE
  /\ triggerVisible = TRUE
  /\ lastAction = "none"

OpenHostOverlay ==
  /\ ~hostOverlayOpen
  /\ hostOverlayOpen' = TRUE
  /\ focusInUnmanagedHost' = TRUE
  /\ focusOwner' = "host"
  /\ lastAction' = "host_open"
  /\ UNCHANGED <<stack, globalListenerAttached, formValid, triggerVisible>>

FocusUnmanagedHost ==
  /\ hostOverlayOpen
  /\ ~focusInUnmanagedHost
  /\ focusInUnmanagedHost' = TRUE
  /\ focusOwner' = "host"
  /\ lastAction' = "host_focus"
  /\ UNCHANGED <<stack, globalListenerAttached, hostOverlayOpen, formValid, triggerVisible>>

CloseHostOverlay ==
  /\ hostOverlayOpen
  /\ hostOverlayOpen' = FALSE
  /\ focusInUnmanagedHost' = FALSE
  /\ focusOwner' = TopOrPage(stack)
  /\ lastAction' = "host_close"
  /\ UNCHANGED <<stack, globalListenerAttached, formValid, triggerVisible>>

OpenModal ==
  /\ ~SeqContains(stack, "modal")
  /\ LET next == Append(stack, "modal")
     IN /\ stack' = next
        /\ globalListenerAttached' = TRUE
        /\ focusInUnmanagedHost' = FALSE
        /\ focusOwner' = TopOrPage(next)
        /\ lastAction' = "open"
        /\ UNCHANGED <<hostOverlayOpen, formValid, triggerVisible>>

OpenPopover ==
  /\ triggerVisible
  /\ ~SeqContains(stack, "popover")
  /\ LET next == Append(stack, "popover")
     IN /\ stack' = next
        /\ globalListenerAttached' = TRUE
        /\ focusInUnmanagedHost' = FALSE
        /\ focusOwner' = TopOrPage(next)
        /\ lastAction' = "open"
        /\ UNCHANGED <<hostOverlayOpen, formValid, triggerVisible>>

OpenFullscreen ==
  /\ ~SeqContains(stack, "fullscreen")
  /\ LET next == Append(stack, "fullscreen")
     IN /\ stack' = next
        /\ globalListenerAttached' = TRUE
        /\ focusInUnmanagedHost' = FALSE
        /\ focusOwner' = TopOrPage(next)
        /\ lastAction' = "open"
        /\ UNCHANGED <<hostOverlayOpen, formValid, triggerVisible>>

PressEscapeInManaged ==
  /\ ~focusInUnmanagedHost
  /\ Len(stack) > 0
  /\ LET next == SubSeq(stack, 1, Len(stack) - 1)
     IN /\ stack' = next
        /\ globalListenerAttached' = (Len(next) > 0)
        /\ focusOwner' = TopOrPage(next)
        /\ lastAction' = "escape"
        /\ UNCHANGED <<hostOverlayOpen, focusInUnmanagedHost, formValid, triggerVisible>>

PressEscapeInUnmanagedHost ==
  /\ focusInUnmanagedHost
  /\ hostOverlayOpen
  /\ hostOverlayOpen' = FALSE
  /\ focusInUnmanagedHost' = FALSE
  /\ focusOwner' = TopOrPage(stack)
  /\ lastAction' = "host_escape"
  /\ UNCHANGED <<stack, globalListenerAttached, formValid, triggerVisible>>

TabInModalWithPortalPopover ==
  /\ ~focusInUnmanagedHost
  /\ SeqContains(stack, "modal")
  /\ Len(stack) > 0
  /\ stack[Len(stack)] = "popover"
  /\ focusOwner = "popover"
  /\ focusOwner' = "popover"
  /\ lastAction' = "tab_portal"
  /\ UNCHANGED <<stack, globalListenerAttached, hostOverlayOpen, focusInUnmanagedHost, formValid, triggerVisible>>

TriggerLocalFunctionAction ==
  /\ ~focusInUnmanagedHost
  /\ SeqContains(stack, "modal")
  /\ lastAction' = "local"
  /\ UNCHANGED <<stack, globalListenerAttached, focusOwner, hostOverlayOpen, focusInUnmanagedHost, formValid, triggerVisible>>

SubmitInModal ==
  /\ ~focusInUnmanagedHost
  /\ Len(stack) > 0
  /\ stack[Len(stack)] = "modal"
  /\ IF formValid
     THEN LET next == SubSeq(stack, 1, Len(stack) - 1)
          IN /\ stack' = next
             /\ globalListenerAttached' = (Len(next) > 0)
             /\ focusOwner' = TopOrPage(next)
     ELSE UNCHANGED <<stack, globalListenerAttached, focusOwner>>
  /\ lastAction' = "submit"
  /\ UNCHANGED <<hostOverlayOpen, focusInUnmanagedHost, formValid, triggerVisible>>

ScrollTriggerOutOfView ==
  /\ triggerVisible
  /\ triggerVisible' = FALSE
  /\ LET next == RemoveFromSeq(stack, "popover")
     IN /\ stack' = next
        /\ globalListenerAttached' = (Len(next) > 0)
        /\ focusOwner' = IF focusInUnmanagedHost THEN "host" ELSE TopOrPage(next)
        /\ lastAction' = "scroll"
        /\ UNCHANGED <<hostOverlayOpen, focusInUnmanagedHost, formValid>>

ScrollTriggerIntoView ==
  /\ ~triggerVisible
  /\ triggerVisible' = TRUE
  /\ lastAction' = "scroll"
  /\ UNCHANGED <<stack, globalListenerAttached, focusOwner, hostOverlayOpen, focusInUnmanagedHost, formValid>>

ToggleFormValid ==
  /\ formValid' = ~formValid
  /\ lastAction' = "toggle"
  /\ UNCHANGED <<stack, globalListenerAttached, focusOwner, hostOverlayOpen, focusInUnmanagedHost, triggerVisible>>

Next ==
  \/ OpenHostOverlay
  \/ FocusUnmanagedHost
  \/ CloseHostOverlay
  \/ OpenModal
  \/ OpenPopover
  \/ OpenFullscreen
  \/ PressEscapeInManaged
  \/ PressEscapeInUnmanagedHost
  \/ TabInModalWithPortalPopover
  \/ TriggerLocalFunctionAction
  \/ SubmitInModal
  \/ ScrollTriggerOutOfView
  \/ ScrollTriggerIntoView
  \/ ToggleFormValid

Fairness ==
  /\ SF_vars(PressEscapeInManaged)
  /\ WF_vars(PressEscapeInUnmanagedHost)

Spec == Init /\ [][Next]_vars /\ Fairness

NoDuplicateLayers ==
  \A i, j \in 1..Len(stack) : i # j => stack[i] # stack[j]

ListenerMatchesNonEmptyStack ==
  globalListenerAttached <=> (Len(stack) > 0)

UnmanagedHostFocusRequiresOpenHost ==
  focusInUnmanagedHost => hostOverlayOpen

FocusMatchesTopLayer ==
  IF focusInUnmanagedHost THEN focusOwner = "host" ELSE focusOwner = TopOrPage(stack)

HostOverlayDoesNotBlockNestedManaged ==
  (hostOverlayOpen /\ ~focusInUnmanagedHost /\ Len(stack) > 0) => focusOwner = stack[Len(stack)]

PortalTabKeepsPopoverFocus ==
  (lastAction = "tab_portal") => focusOwner = "popover"

LocalActionNeverClosesModal ==
  (lastAction = "local") => SeqContains(stack, "modal")

HiddenTriggerNeverHoldsPopover ==
  ~triggerVisible => ~SeqContains(stack, "popover")

EscapeCanAlwaysDrain ==
  [](Len(stack) = Cardinality(Layers) => <>(Len(stack) < Cardinality(Layers)))

====
