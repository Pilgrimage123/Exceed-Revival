// Focus-safe Keyboard Shortcuts & lightweight HTML5 Gamepad Adapter.

const InputManager = (() => {
  let gamepadActive = false;
  let lastButtons = {};

  function isTypingInInput(ev) {
    const target = ev && ev.target;
    const tag = target && target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(target && target.isContentEditable);
  }

  function isNativeInteractive(target) {
    const tag = target && target.tagName;
    return tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function activateCustomInteractiveTarget(ev) {
    const target = ev && ev.target;
    if (!target || isNativeInteractive(target)) return false;
    const role = typeof target.getAttribute === 'function' ? target.getAttribute('role') : null;
    const cl = target.classList;
    const hasCls = (name) => !!(cl && typeof cl.contains === 'function' && cl.contains(name));
    if (hasCls('disabled') || (typeof target.getAttribute === 'function' && target.getAttribute('aria-disabled') === 'true')) {
      return false;
    }
    const isCustom = role === 'button' || hasCls('fighter-card') || hasCls('char-card') || hasCls('card-tile') || hasCls('hud-pill') || hasCls('life-panel') || hasCls('cell-movable');
    if (!isCustom) return false;
    if (typeof ev.preventDefault === 'function') ev.preventDefault();
    if (typeof target.click === 'function') target.click();
    return true;
  }

  function handleKeyDown(ev) {
    const key = ev.key;
    const htpOpen = (typeof isHowToPlayOpen === 'function' && isHowToPlayOpen())
      || (() => {
        const htp = typeof document !== 'undefined' ? document.getElementById('howToPlayOverlay') : null;
        return !!(htp && htp.style && htp.style.display && htp.style.display !== 'none');
      })();

    const fpOpen = typeof isFighterPreviewOpen === 'function' && isFighterPreviewOpen();

    if (key === 'Escape') {
      if (htpOpen) {
        if (typeof closeHowToPlay === 'function') closeHowToPlay();
        else {
          const htp = typeof document !== 'undefined' ? document.getElementById('howToPlayOverlay') : null;
          if (htp && htp.style) htp.style.display = 'none';
        }
        return;
      }
      if (fpOpen && typeof FighterPreview !== 'undefined') {
        if (FighterPreview.isCardDetailOpen && FighterPreview.isCardDetailOpen()) {
          FighterPreview.closeCardDetail();
        } else {
          FighterPreview.close();
        }
        return;
      }
      const sp = typeof document !== 'undefined' ? document.getElementById('settings-popover') : null;
      if (sp && sp.style && sp.style.display && sp.style.display !== 'none') { sp.style.display = 'none'; return; }
      if (typeof G !== 'undefined' && G) {
        if (G.cardModal && typeof G.closeCardModal === 'function') { G.closeCardModal(); return; }
        if (G.showLastStrikeModal && typeof G.closeLastStrikeModal === 'function') { G.closeLastStrikeModal(); return; }
        if (G.infoModal) { G.closeInfo(); return; }
        if (G.showNormalMatrix) { G.toggleNormalMatrix(); return; }
        if (!G.rightRailCollapsed && typeof G.toggleRightRail === 'function') { G.toggleRightRail(); return; }
        if (G.selectedActionCardUid) { G.cancelActionCard(); return; }
      }
      if (typeof FullscreenController !== 'undefined' && FullscreenController.isViewportFallback && FullscreenController.isViewportFallback()) {
        FullscreenController.exit();
      }
      return;
    }

    if (isTypingInInput(ev)) return;

    if ((key === 'f' || key === 'F') && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.repeat) {
      if (typeof toggleFullscreen === 'function') {
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        toggleFullscreen();
      }
      return;
    }

    if (key === '?') {
      if (htpOpen) {
        if (typeof closeHowToPlay === 'function') closeHowToPlay();
      } else if (typeof openHowToPlay === 'function') {
        openHowToPlay();
      }
      return;
    }

    if (htpOpen) {
      if (typeof HowToPlayUI !== 'undefined') {
        if (key === 'ArrowLeft') { ev.preventDefault(); HowToPlayUI.stepTab(-1); return; }
        if (key === 'ArrowRight') { ev.preventDefault(); HowToPlayUI.stepTab(1); return; }
        if (key >= '1' && key <= '5') { ev.preventDefault(); HowToPlayUI.jumpTabIndex(parseInt(key, 10)); return; }
      }
      // Block underlying match shortcuts while the Command Manual is open.
      return;
    }

    if (fpOpen && typeof FighterPreview !== 'undefined') {
      if (FighterPreview.isCardDetailOpen && FighterPreview.isCardDetailOpen()) {
        if (key === 'ArrowLeft') { if (ev.preventDefault) ev.preventDefault(); FighterPreview.stepCardDetail(-1); return; }
        if (key === 'ArrowRight') { if (ev.preventDefault) ev.preventDefault(); FighterPreview.stepCardDetail(1); return; }
      } else if (typeof FighterPreview.stepFighter === 'function') {
        if (key === 'ArrowLeft') { if (ev.preventDefault) ev.preventDefault(); FighterPreview.stepFighter(-1); return; }
        if (key === 'ArrowRight') { if (ev.preventDefault) ev.preventDefault(); FighterPreview.stepFighter(1); return; }
      }
      return;
    }

    if (typeof G !== 'undefined' && G && G.cardModal) {
      return;
    }

    if ((key === 'Enter' || key === ' ') && !ev.repeat && activateCustomInteractiveTarget(ev)) {
      return;
    }

    if (typeof G === 'undefined' || !G) return;

    if ((key === 'v' || key === 'V') && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.repeat) {
      if (typeof G.openActiveCardModal === 'function' && G.openActiveCardModal()) {
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
      }
      return;
    }

    if (key === 'Shift') {
      if (typeof EventBus !== 'undefined') EventBus.emit('OnToggleOptionalBranch', { enabled: true });
      return;
    }
    if (key === ' ') {
      if (isNativeInteractive(ev.target)) return;
      if (G.fxPlaying) { ev.preventDefault(); G.skipFx(); return; }
      if (G.mode === 'strike_result') {
        ev.preventDefault();
        if (typeof StrikePlaybackController !== 'undefined') StrikePlaybackController.skip();
        G.continueAfterStrikeResult();
      }
      return;
    }
    if (key === 'n' || key === 'N') {
      G.toggleNormalMatrix();
      return;
    }
    const isHumanTurn = G.engine && G.engine.active === G.humanId && !G.engine.gameOver;
    if (key === 'e' || key === 'E') {
      if (typeof StrikePreviewController !== 'undefined' && StrikePreviewController.getActiveHover()) {
        EventBus.emit('OnToggleEXMode', {});
        return;
      }
      if (isHumanTurn && G.mode === 'awaiting_action' && G.engine.canExceed(G.human())) {
        G.actionExceed();
      }
      return;
    }
    if ((key === 'c' || key === 'C') && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.repeat) {
      if (typeof StrikePreviewController !== 'undefined' && StrikePreviewController.getActiveHover()) {
        if (typeof ev.preventDefault === 'function') ev.preventDefault();
        EventBus.emit('OnToggleCriticalPreview', {});
        return;
      }
    }

    if (isHumanTurn && G.mode === 'awaiting_action') {
      if (key === 's' || key === 'S') { G.startStrike(); return; }
      if (key === 'b' || key === 'B') { G.startBoost(); return; }
      if (key === 'm' || key === 'M') { G.startMove(); return; }
      if (key >= '1' && key <= '9') {
        const idx = parseInt(key, 10) - 1;
        const hand = G.human().hand;
        if (hand[idx]) G.selectActionCard(hand[idx].uid);
        return;
      }
      if (key === 'Enter' && G.selectedActionCardUid && !isNativeInteractive(ev.target)) {
        G.confirmActionCard('strike');
      }
    }
  }

  function handleKeyUp(ev) {
    if (ev.key === 'Shift' && typeof EventBus !== 'undefined') {
      EventBus.emit('OnToggleOptionalBranch', { enabled: false });
    }
  }

  function pollGamepad() {
    if (!gamepadActive || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const gp = pads && pads[0];
    if (!gp) { gamepadActive = false; return; }
    const pressed = (idx) => !!(gp.buttons[idx] && gp.buttons[idx].pressed);
    const justPressed = (idx) => {
      const now = pressed(idx);
      const prev = !!lastButtons[idx];
      lastButtons[idx] = now;
      return now && !prev;
    };
    if (typeof G !== 'undefined' && G) {
      if (justPressed(0) && G.mode === 'awaiting_action' && G.selectedActionCardUid) G.confirmActionCard('strike'); // A
      if (justPressed(1) && G.selectedActionCardUid) G.cancelActionCard(); // B
      if (justPressed(2) && G.mode === 'awaiting_action') G.startBoost(); // X
      if (justPressed(3) && G.mode === 'awaiting_action') G.startMove(); // Y
    }
    requestAnimationFrame(pollGamepad);
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('gamepadconnected', () => {
      if (!gamepadActive) {
        gamepadActive = true;
        requestAnimationFrame(pollGamepad);
      }
    });
  }

  return { handleKeyDown };
})();
