// In-place Arena Telegraph & Clash Summary Banner renderers.
// Mutates DOM/SVG elements directly without triggering full paint() re-renders.

const ArenaTelegraphRenderer = (() => {
  function clear() {
    const board = document.querySelector('.board');
    if (!board) return;
    board.querySelectorAll('.cell').forEach((cell) => {
      cell.classList.remove('telegraph-hitbox', 'telegraph-wall-hazard', 'telegraph-after-space', 'band-lit');
      cell.querySelectorAll('.telegraph-ghost, .telegraph-after-ghost, .telegraph-whiff-tag, .telegraph-wall-chevron').forEach((el) => el.remove());
    });
    const oldSvg = board.querySelector('.telegraph-spline-svg');
    if (oldSvg) oldSvg.remove();
    // Clear projected lethal damage segment on opponent HP bar
    const dmgSeg = document.querySelector('.opp-projected-dmg');
    if (dmgSeg) dmgSeg.style.width = '0%';
    const skull = document.querySelector('.opp-public-lethal-skull');
    if (skull) skull.classList.remove('visible');
  }

  function render(preview, infoSet) {
    clear();
    if (!preview || !infoSet) return;
    const board = document.querySelector('.board');
    if (!board) return;
    const cells = [...board.querySelectorAll('.cell')];
    if (cells.length !== BOARD_SIZE) return;

    const myPos = infoSet.actor.pos;
    const oppPos = infoSet.opponent.pos;

    // 1. Bright red hitbox spaces (post-Before)
    for (const s of (preview.hitboxSpaces || [])) {
      const cell = cells[s];
      if (cell) cell.classList.add('telegraph-hitbox');
    }

    // 2. Wall hazard chevrons on space 0 (1) or 8 (9) when truncated
    if (preview.wallTruncated) {
      const edgeIdx = preview.postBeforeSpace <= 1 ? 0 : (preview.postBeforeSpace >= BOARD_SIZE - 2 ? BOARD_SIZE - 1 : (myPos < oppPos ? BOARD_SIZE - 1 : 0));
      const edgeCell = cells[edgeIdx];
      if (edgeCell) {
        edgeCell.classList.add('telegraph-wall-hazard');
        const chev = document.createElement('div');
        chev.className = 'telegraph-wall-chevron';
        chev.textContent = edgeIdx === 0 ? '« WALL' : 'WALL »';
        edgeCell.appendChild(chev);
      }
    }

    // 3. Solid post-Before ghost silhouette (if moved or whiffing)
    const ghostCell = cells[preview.postBeforeSpace];
    if (ghostCell) {
      const facingRightAfter = preview.postBeforeSpace < oppPos;
      const ghost = document.createElement('div');
      ghost.className = `telegraph-ghost ${facingRightAfter ? 'facing-right' : 'facing-left'}${preview.didCrossUp ? ' crossed-up' : ''}`;
      ghost.innerHTML = `<span class="ghost-label">${preview.didCrossUp ? '⇄ FLIP' : 'YOU'}</span>`;
      ghostCell.appendChild(ghost);

      if (preview.willWhiff) {
        const whiff = document.createElement('div');
        whiff.className = 'telegraph-whiff-tag';
        whiff.textContent = 'OUT OF RANGE';
        ghostCell.appendChild(whiff);
      }
    }

    // 4. Faint dotted post-After ghost (secondary outcome, shown only if hitting)
    if (preview.postAfterSpace != null && preview.postAfterSpace !== preview.postBeforeSpace) {
      const afterCell = cells[preview.postAfterSpace];
      if (afterCell) {
        afterCell.classList.add('telegraph-after-space');
        const ag = document.createElement('div');
        ag.className = 'telegraph-after-ghost';
        ag.innerHTML = '<span>AFTER</span>';
        afterCell.appendChild(ag);
      }
    }

    // 5. Stepped path spline SVG overlay
    const path = preview.movementPath || [];
    if (path.length > 1) {
      renderSpline(board, cells, path, preview.didCrossUp, preview.afterPath);
    } else if (preview.afterPath && preview.afterPath.length > 1) {
      renderSpline(board, cells, [], false, preview.afterPath);
    }

    // 6. Projected damage & Public-State Lethal skull on opponent HP bar
    const oppMax = Math.max(1, infoSet.opponent.maxLife || 30);
    const oppLife = Math.max(0, infoSet.opponent.life || 0);
    const dmg = preview.projectedDamage || 0;
    const dmgSeg = document.querySelector('.opp-projected-dmg');
    if (dmgSeg && dmg > 0) {
      const pct = Math.min(100, (Math.min(oppLife, dmg) / oppMax) * 100);
      const rightPct = Math.max(0, ((oppMax - oppLife) / oppMax) * 100);
      dmgSeg.style.right = `${rightPct}%`;
      dmgSeg.style.width = `${pct}%`;
    }
    const skull = document.querySelector('.opp-public-lethal-skull');
    if (skull) {
      skull.classList.toggle('visible', !!preview.isPublicStateLethal);
    }
  }

  function renderSpline(board, cells, path, didCrossUp, afterPath) {
    const boardRect = board.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'telegraph-spline-svg');
    svg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);

    const centerOf = (idx) => {
      const cell = cells[idx];
      const pad = cell && cell.querySelector ? cell.querySelector('.cell-floor-pad') : null;
      const r = pad ? pad.getBoundingClientRect() : cell.getBoundingClientRect();
      return {
        x: r.left - boardRect.left + r.width / 2,
        y: pad ? (r.top - boardRect.top + r.height * 0.5) : (r.top - boardRect.top + r.height * 0.8),
      };
    };

    if (path.length > 1) {
      let d = '';
      for (let i = 0; i < path.length; i++) {
        const pt = centerOf(path[i]);
        if (i === 0) d += `M ${pt.x} ${pt.y}`;
        else {
          const prev = centerOf(path[i - 1]);
          const jump = Math.abs(path[i] - path[i - 1]) > 1;
          if (jump) {
            const mx = (prev.x + pt.x) / 2;
            const my = Math.min(prev.y, pt.y) - 26;
            d += ` Q ${mx} ${my} ${pt.x} ${pt.y}`;
          } else {
            d += ` L ${pt.x} ${pt.y}`;
          }
        }
      }
      const pEl = document.createElementNS(svgNS, 'path');
      pEl.setAttribute('d', d);
      pEl.setAttribute('class', didCrossUp ? 'spline-before crossup' : 'spline-before');
      svg.appendChild(pEl);
    }

    if (afterPath && afterPath.length > 1) {
      let d2 = '';
      for (let i = 0; i < afterPath.length; i++) {
        const pt = centerOf(afterPath[i]);
        d2 += (i === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`);
      }
      const p2 = document.createElementNS(svgNS, 'path');
      p2.setAttribute('d', d2);
      p2.setAttribute('class', 'spline-after');
      svg.appendChild(p2);
    }

    board.appendChild(svg);
  }

  return { render, clear };
})();

const ClashSummaryBanner = (() => {
  function getSlot() {
    return document.getElementById('clash-banner-slot');
  }

  function syncStripState(slot, active) {
    const strip = slot && slot.parentElement;
    if (strip && strip.classList) {
      if (active) strip.classList.add('has-clash-banner');
      else strip.classList.remove('has-clash-banner');
    }
  }

  function clear() {
    const slot = getSlot();
    if (slot) {
      slot.innerHTML = '';
      syncStripState(slot, false);
    }
  }

  function render(preview, infoSet, hoverMeta) {
    const slot = getSlot();
    if (!slot) return;
    if (!preview || !infoSet) {
      slot.innerHTML = '';
      syncStripState(slot, false);
      return;
    }
    const s = preview.effectiveStats || {};
    const isInitiator = typeof G === 'undefined' || G.mode !== 'defend_select';
    const oppBoosts = (infoSet.opponent.boostKeys || []).map((k) => {
      const c = typeof SimulateStrikePreview !== 'undefined' ? SimulateStrikePreview.resolveCardByKey(k) : null;
      return c ? c.name : k;
    });
    const hasOpt = preview.optionalBranches && preview.optionalBranches.length > 0;
    const optActive = !!(hoverMeta && hoverMeta.useOptionalBranch);
    const exActive = !!(hoverMeta && hoverMeta.isEX);

    const varBadge = preview.hasStochasticVariance ? '<span class="clash-pill var" title="Stochastic outcome (Wild Swing / Draw)">?</span>' : '';
    const lethalBadge = preview.isPublicStateLethal
      ? '<span class="clash-pill lethal" title="Lethal vs. current board state">☠ Public Lethal</span>'
      : '';
    const whiffBadge = preview.willWhiff ? '<span class="clash-pill whiff">OUT OF RANGE</span>' : '';
    const optPill = hasOpt
      ? `<button type="button" class="clash-toggle ${optActive ? 'active' : ''}" onclick="EventBus.emit('OnToggleOptionalBranch', {})">[Shift] Optional: ${esc(preview.optionalBranches[0].label)}</button>`
      : '';
    const exPill = exActive ? '<span class="clash-pill ex">EX (+1 All)</span>' : '';

    const pill = (k, v) => (typeof statPillHTML === 'function'
      ? statPillHTML(k, v, { showFullLabel: true, extraClass: 'stat-inline' })
      : `<b>${k.toUpperCase()} ${v}</b>`);

    slot.innerHTML = `
      <div class="clash-banner">
        <div class="clash-side you">
          <span class="clash-badge ${isInitiator ? 'striker' : 'defender'}">${isInitiator ? 'STRIKER (Wins Speed Ties)' : 'DEFENDER'}</span>
          <span class="clash-stats">
            ${pill('spd', s.spd)} ${pill('pow', s.pow)} ${pill('arm', s.arm)} ${pill('grd', s.grd)}
            ${s.ignoreArmor ? '<em class="tag-ignore">Ignores ARM</em>' : ''}
            ${s.ignoreGuard ? '<em class="tag-ignore">Ignores GRD</em>' : ''}
          </span>
          ${exPill}${varBadge}${whiffBadge}${lethalBadge}${optPill}
        </div>
        <div class="clash-vs">VS</div>
        <div class="clash-side opp">
          <span class="clash-stats"><span class="clash-opp-lbl">OPP:</span> ${pill('arm', s.oppVisibleArm)} ${pill('grd', s.oppVisibleGrd)}${s.oppStunImmune ? ' · Stun Immune' : ''}</span>
          ${oppBoosts.length ? `<span class="clash-boosts">Boosts: ${esc(oppBoosts.join(', '))}</span>` : ''}
          <span class="clash-dmg">Proj. DMG: <b>${preview.hasStochasticVariance ? '?' : preview.projectedDamage}</b></span>
        </div>
      </div>
    `;
    syncStripState(slot, true);
  }

  return { render, clear };
})();
