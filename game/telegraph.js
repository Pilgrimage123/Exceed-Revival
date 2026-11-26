// In-place Arena Telegraph & Clash Summary Banner renderers.
// Mutates DOM/SVG elements directly without triggering full paint() re-renders.

const ArenaTelegraphRenderer = (() => {
  function clear() {
    const board = document.querySelector('.board');
    if (board) {
      board.querySelectorAll('.cell').forEach((cell) => {
        cell.classList.remove(
          'telegraph-hitbox',
          'telegraph-hitbox-miss',
          'telegraph-target-hit',
          'telegraph-target-miss',
          'telegraph-wall-hazard',
          'telegraph-after-space',
          'telegraph-opp-after',
          'telegraph-eddie-origin',
          'band-lit',
        );
        cell.querySelectorAll(
          '.telegraph-ghost, .telegraph-after-ghost, .telegraph-opp-ghost, .telegraph-whiff-tag, .telegraph-impact-tag, .telegraph-eddie-tag, .telegraph-wall-chevron',
        ).forEach((el) => el.remove());
      });
      const oldSvg = board.querySelector('.telegraph-spline-svg');
      if (oldSvg) oldSvg.remove();
    }

    // Clear projected damage & HP delta readouts on HUD life bars
    const dmgSeg = document.querySelector('.opp-projected-dmg');
    if (dmgSeg) dmgSeg.style.width = '0%';
    const skull = document.querySelector('.opp-public-lethal-skull');
    if (skull) skull.classList.remove('visible');
    const oppLifeEl = document.querySelector('.opp-projected-life');
    if (oppLifeEl) {
      oppLifeEl.textContent = '';
      oppLifeEl.classList.remove('visible', 'is-lethal', 'is-miss', 'is-zero');
    }
    const youLifeEl = document.querySelector('.you-projected-life');
    if (youLifeEl) {
      youLifeEl.textContent = '';
      youLifeEl.classList.remove('visible', 'is-heal', 'is-dmg');
    }
  }

  function shortMissTag(preview) {
    switch (preview.missReason) {
      case 'range_immune': return '✗ RNG IMMUNE';
      case 'no_continuous_boost': return '✗ NO BOOST';
      case 'self_cannot_hit': return '✗ CROSSED PAST';
      case 'always_miss': return '✗ CANNOT HIT';
      default: return 'OUT OF RANGE';
    }
  }

  function render(preview, infoSet) {
    clear();
    if (!preview || !infoSet) return;
    const board = document.querySelector('.board');
    const cells = board ? [...board.querySelectorAll('.cell')] : [];
    const hasBoard = !!(board && cells.length === BOARD_SIZE);

    const myPos = infoSet.actor.pos;
    const oppPos = infoSet.opponent.pos;
    const oppMax = Math.max(1, infoSet.opponent.maxLife || 30);
    const oppLifeBefore = preview.oppLifeBefore != null ? preview.oppLifeBefore : Math.max(0, infoSet.opponent.life || 0);
    const dmg = preview.projectedDamage || 0;
    const oppLifeAfter = preview.oppLifeAfter != null ? preview.oppLifeAfter : Math.max(0, oppLifeBefore - dmg);
    const oppLifeLoss = preview.oppLifeLoss != null ? preview.oppLifeLoss : Math.max(0, oppLifeBefore - oppLifeAfter);

    if (hasBoard) {
      // 1. Hitbox spaces (measured from post-Before position or Eddie)
      for (const s of (preview.hitboxSpaces || [])) {
        const cell = cells[s];
        if (!cell) continue;
        cell.classList.add('telegraph-hitbox');
        if (preview.willWhiff) cell.classList.add('telegraph-hitbox-miss');
      }

      // 2. Eddie origin indicator (Zato-1 Specials/Ultras)
      if (preview.usesEddie && preview.attackOrigin != null && cells[preview.attackOrigin]) {
        const edCell = cells[preview.attackOrigin];
        edCell.classList.add('telegraph-eddie-origin');
        const tag = document.createElement('div');
        tag.className = 'telegraph-eddie-tag';
        tag.textContent = 'EDDIE · RNG';
        edCell.appendChild(tag);
      }

      // 3. Target cell hit / miss highlight & impact badge
      const oppCell = cells[oppPos];
      if (oppCell) {
        if (preview.hasStochasticVariance) {
          const imp = document.createElement('div');
          imp.className = 'telegraph-impact-tag is-var';
          imp.textContent = '🎲 RANDOM';
          oppCell.appendChild(imp);
        } else if (preview.willWhiff) {
          oppCell.classList.add('telegraph-target-miss');
        } else {
          oppCell.classList.add('telegraph-target-hit');
          const imp = document.createElement('div');
          imp.className = `telegraph-impact-tag ${preview.isPublicStateLethal ? 'is-lethal' : (dmg > 0 ? 'is-hit' : 'is-zero')}`;
          if (preview.isPublicStateLethal) {
            imp.textContent = `☠ LETHAL (-${oppLifeLoss} HP)`;
          } else if (dmg > 0) {
            imp.textContent = `✓ HIT -${oppLifeLoss} HP`;
          } else {
            imp.textContent = '✓ HIT · 0 DMG';
          }
          oppCell.appendChild(imp);
        }
      }

      // 4. Wall hazard chevrons on space 0 (Sp 1) or 8 (Sp 9) when movement is truncated
      if (preview.wallTruncated) {
        const postBefore = preview.postBeforeSpace != null ? preview.postBeforeSpace : myPos;
        const edgeIdx = postBefore <= 1
          ? 0
          : (postBefore >= BOARD_SIZE - 2 ? BOARD_SIZE - 1 : (myPos < oppPos ? BOARD_SIZE - 1 : 0));
        const edgeCell = cells[edgeIdx];
        if (edgeCell) {
          edgeCell.classList.add('telegraph-wall-hazard');
          const chev = document.createElement('div');
          chev.className = 'telegraph-wall-chevron';
          chev.textContent = edgeIdx === 0 ? '« WALL' : 'WALL »';
          edgeCell.appendChild(chev);
        }
      }

      // 5. Post-Before ghost silhouette (shown when moving or crossing up) & whiff tag
      const postBefore = preview.postBeforeSpace != null ? preview.postBeforeSpace : myPos;
      const ghostCell = cells[postBefore];
      const movedBefore = postBefore !== myPos || !!preview.didCrossUp;
      if (ghostCell) {
        if (movedBefore) {
          const facingRightAfter = postBefore < oppPos;
          const ghost = document.createElement('div');
          ghost.className = `telegraph-ghost ${facingRightAfter ? 'facing-right' : 'facing-left'}${preview.didCrossUp ? ' crossed-up' : ''}`;
          ghost.innerHTML = `<span class="ghost-label">${preview.didCrossUp ? `⇄ FLIP · Sp ${postBefore + 1}` : `YOU · Sp ${postBefore + 1}`}</span>`;
          ghostCell.appendChild(ghost);
        }
        if (preview.willWhiff) {
          const whiff = document.createElement('div');
          whiff.className = 'telegraph-whiff-tag';
          whiff.textContent = shortMissTag(preview);
          (oppCell || ghostCell).appendChild(whiff);
        }
      }

      // 6. Opponent Hit Push/Pull destination ghost
      if (preview.oppPostHitSpace != null && preview.oppPostHitSpace !== oppPos) {
        const oppAfterCell = cells[preview.oppPostHitSpace];
        if (oppAfterCell) {
          oppAfterCell.classList.add('telegraph-opp-after');
          const og = document.createElement('div');
          og.className = 'telegraph-opp-ghost';
          og.innerHTML = `<span>CPU → Sp ${preview.oppPostHitSpace + 1}</span>`;
          oppAfterCell.appendChild(og);
        }
      }

      // 7. Post-After self-move ghost (runs even on whiff, e.g. Cross Retreat 3)
      if (preview.postAfterSpace != null && preview.postAfterSpace !== postBefore) {
        const afterCell = cells[preview.postAfterSpace];
        if (afterCell) {
          afterCell.classList.add('telegraph-after-space');
          const ag = document.createElement('div');
          ag.className = 'telegraph-after-ghost';
          ag.innerHTML = `<span>AFTER · Sp ${preview.postAfterSpace + 1}</span>`;
          afterCell.appendChild(ag);
        }
      }

      // 8. Stepped path spline SVG overlay (Before, Hit Push/Pull, After)
      const path = preview.movementPath || [];
      const oppPath = preview.oppHitMovePath || [];
      const afterPath = preview.afterPath || [];
      if (path.length > 1 || oppPath.length > 1 || afterPath.length > 1) {
        renderSpline(board, cells, path, !!preview.didCrossUp, afterPath, oppPath);
      }
    }

    // 9. Projected damage bar, Public-State Lethal skull, and Life Loss deltas on HUD bars
    const dmgSeg = document.querySelector('.opp-projected-dmg');
    if (dmgSeg && !preview.hasStochasticVariance && !preview.willWhiff && dmg > 0) {
      const pct = Math.min(100, (Math.min(oppLifeBefore, dmg) / oppMax) * 100);
      const rightPct = Math.max(0, ((oppMax - oppLifeBefore) / oppMax) * 100);
      dmgSeg.style.right = `${rightPct}%`;
      dmgSeg.style.width = `${pct}%`;
    }
    const skull = document.querySelector('.opp-public-lethal-skull');
    if (skull) {
      skull.classList.toggle('visible', !!preview.isPublicStateLethal);
    }
    const oppLifeEl = document.querySelector('.opp-projected-life');
    if (oppLifeEl) {
      if (preview.hasStochasticVariance) {
        oppLifeEl.textContent = '→ ?';
        oppLifeEl.classList.add('visible', 'is-zero');
      } else if (preview.willWhiff) {
        oppLifeEl.textContent = 'MISS';
        oppLifeEl.classList.add('visible', 'is-miss');
      } else if (oppLifeLoss > 0) {
        oppLifeEl.textContent = preview.isPublicStateLethal
          ? `→ 0 (-${oppLifeLoss})`
          : `→ ${oppLifeAfter} (-${oppLifeLoss})`;
        oppLifeEl.classList.add('visible');
        if (preview.isPublicStateLethal) oppLifeEl.classList.add('is-lethal');
      } else {
        oppLifeEl.textContent = `→ ${oppLifeBefore} (0)`;
        oppLifeEl.classList.add('visible', 'is-zero');
      }
    }
    const youLifeEl = document.querySelector('.you-projected-life');
    if (youLifeEl && preview.selfLifeDelta) {
      const sign = preview.selfLifeDelta > 0 ? '+' : '';
      youLifeEl.textContent = `→ ${preview.selfLifeAfter} (${sign}${preview.selfLifeDelta})`;
      youLifeEl.classList.add('visible', preview.selfLifeDelta > 0 ? 'is-heal' : 'is-dmg');
    }
  }

  function addMarker(defs, svgNS, id, color) {
    const marker = document.createElementNS(svgNS, 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '7');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '5');
    marker.setAttribute('markerHeight', '5');
    marker.setAttribute('orient', 'auto-start-reverse');
    const poly = document.createElementNS(svgNS, 'path');
    poly.setAttribute('d', 'M 0 1.5 L 8.5 5 L 0 8.5 z');
    poly.setAttribute('fill', color);
    marker.appendChild(poly);
    defs.appendChild(marker);
  }

  function renderSpline(board, cells, path, didCrossUp, afterPath, oppPath) {
    const boardRect = board.getBoundingClientRect();
    if (!boardRect.width || !boardRect.height) return;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'telegraph-spline-svg');
    svg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);

    const defs = document.createElementNS(svgNS, 'defs');
    addMarker(defs, svgNS, 'tp-arrow-before', '#4de6d1');
    addMarker(defs, svgNS, 'tp-arrow-crossup', '#f7c65a');
    addMarker(defs, svgNS, 'tp-arrow-after', '#60a5fa');
    addMarker(defs, svgNS, 'tp-arrow-opp', '#ff8c42');
    svg.appendChild(defs);

    const centerOf = (idx, yOffset = 0) => {
      const cell = cells[idx];
      const pad = cell && cell.querySelector ? cell.querySelector('.cell-floor-pad') : null;
      const r = pad ? pad.getBoundingClientRect() : cell.getBoundingClientRect();
      return {
        x: r.left - boardRect.left + r.width / 2,
        y: (pad ? (r.top - boardRect.top + r.height * 0.5) : (r.top - boardRect.top + r.height * 0.8)) + yOffset,
      };
    };

    if (path && path.length > 1) {
      let d = '';
      for (let i = 0; i < path.length; i++) {
        const pt = centerOf(path[i], 0);
        if (i === 0) d += `M ${pt.x} ${pt.y}`;
        else {
          const prev = centerOf(path[i - 1], 0);
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
      pEl.setAttribute('marker-end', didCrossUp ? 'url(#tp-arrow-crossup)' : 'url(#tp-arrow-before)');
      svg.appendChild(pEl);
    }

    if (oppPath && oppPath.length > 1) {
      let dOpp = '';
      for (let i = 0; i < oppPath.length; i++) {
        const pt = centerOf(oppPath[i], -8);
        if (i === 0) dOpp += `M ${pt.x} ${pt.y}`;
        else {
          const prev = centerOf(oppPath[i - 1], -8);
          const jump = Math.abs(oppPath[i] - oppPath[i - 1]) > 1;
          if (jump) {
            const mx = (prev.x + pt.x) / 2;
            const my = Math.min(prev.y, pt.y) - 22;
            dOpp += ` Q ${mx} ${my} ${pt.x} ${pt.y}`;
          } else {
            dOpp += ` L ${pt.x} ${pt.y}`;
          }
        }
      }
      const pOpp = document.createElementNS(svgNS, 'path');
      pOpp.setAttribute('d', dOpp);
      pOpp.setAttribute('class', 'spline-opp-push');
      pOpp.setAttribute('marker-end', 'url(#tp-arrow-opp)');
      svg.appendChild(pOpp);
    }

    if (afterPath && afterPath.length > 1) {
      let d2 = '';
      for (let i = 0; i < afterPath.length; i++) {
        const pt = centerOf(afterPath[i], 6);
        d2 += (i === 0 ? `M ${pt.x} ${pt.y}` : ` L ${pt.x} ${pt.y}`);
      }
      const p2 = document.createElementNS(svgNS, 'path');
      p2.setAttribute('d', d2);
      p2.setAttribute('class', 'spline-after');
      p2.setAttribute('marker-end', 'url(#tp-arrow-after)');
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

  function formatRangeText(s) {
    if (s.minRange == null || s.maxRange == null) return '—';
    return s.minRange === s.maxRange ? String(s.minRange) : `${s.minRange}–${s.maxRange}`;
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
    const isInitiator = preview.isInitiator != null
      ? !!preview.isInitiator
      : (typeof G === 'undefined' || G.mode !== 'defend_select');
    const oppBoosts = (infoSet.opponent.boostKeys || []).map((k) => {
      const c = typeof SimulateStrikePreview !== 'undefined' ? SimulateStrikePreview.resolveCardByKey(k) : null;
      if (!c) return k;
      return typeof boostEffectSummary === 'function' ? boostEffectSummary(c) : c.name;
    });
    const hasOpt = Array.isArray(preview.optionalBranches) && preview.optionalBranches.length > 0;
    const optActive = !!(hoverMeta && hoverMeta.useOptionalBranch);
    const exActive = !!(preview.isEX || (hoverMeta && hoverMeta.isEX));
    const critActive = !!preview.criticalActive;
    const critFree = !!preview.criticalFree;
    const canPreviewCrit = !!preview.canPreviewCritical;

    const rangeText = formatRangeText(s);
    const initialDist = preview.initialDist != null
      ? preview.initialDist
      : Math.abs((infoSet.actor.pos || 0) - (infoSet.opponent.pos || 0));
    const postBeforeDist = preview.postBeforeDist != null ? preview.postBeforeDist : initialDist;
    const oppLifeBefore = preview.oppLifeBefore != null ? preview.oppLifeBefore : Math.max(0, infoSet.opponent.life || 0);
    const dmg = preview.projectedDamage != null ? preview.projectedDamage : 0;
    const oppLifeAfter = preview.oppLifeAfter != null ? preview.oppLifeAfter : Math.max(0, oppLifeBefore - dmg);
    const oppLifeLoss = preview.oppLifeLoss != null ? preview.oppLifeLoss : Math.max(0, oppLifeBefore - oppLifeAfter);

    const spdVal = s.spd != null ? s.spd : 0;
    const powVal = s.pow != null ? s.pow : 0;
    const armVal = s.arm != null ? s.arm : 0;
    const grdVal = s.grd != null ? s.grd : 0;
    const oppArmVal = s.oppVisibleArm != null ? s.oppVisibleArm : 0;
    const oppGrdVal = s.oppVisibleGrd != null ? s.oppVisibleGrd : 0;

    let verdictBadge = '';
    if (preview.hasStochasticVariance) {
      verdictBadge = '<span class="clash-pill var" title="Stochastic outcome (Wild Swing)">🎲 WILD SWING</span>';
    } else if (preview.isPublicStateLethal) {
      verdictBadge = '<span class="clash-pill lethal" title="Lethal vs. current visible board state">☠ Public Lethal</span>';
    } else if (preview.willWhiff) {
      const missTxt = preview.missReason === 'range_immune'
        ? '✗ RANGE IMMUNE'
        : (preview.missReason === 'no_continuous_boost'
          ? '✗ NEEDS BOOST'
          : (preview.missReason === 'self_cannot_hit'
            ? '✗ CROSSED PAST'
            : (preview.missReason === 'always_miss' ? '✗ CANNOT HIT' : '✗ OUT OF RANGE')));
      verdictBadge = `<span class="clash-pill whiff" title="${esc(preview.missReasonLabel || missTxt)}">${esc(missTxt)}</span>`;
    } else if (preview.hitBySideSwap) {
      verdictBadge = '<span class="clash-pill hit" title="Connects via Cross-Up side swap">✓ HIT (CROSS-UP)</span>';
    } else if (preview.hitByBeforeMove) {
      verdictBadge = '<span class="clash-pill hit" title="Connects after Before movement">✓ HIT (AFTER MOVE)</span>';
    } else {
      verdictBadge = '<span class="clash-pill hit" title="Expected to connect at projected distance">✓ EXPECTED HIT</span>';
    }

    const exPill = exActive ? '<span class="clash-pill ex">EX +1</span>' : '';
    const critPill = critFree
      ? '<span class="clash-pill crit" title="Free Critical from active Boost">CRIT (Free)</span>'
      : (critActive ? '<span class="clash-pill crit">CRIT</span>' : '');
    const critToggle = canPreviewCrit
      ? `<button type="button" class="clash-toggle crit-toggle ${critActive ? 'active' : ''}" onclick="EventBus.emit('OnToggleCriticalPreview', {})" title="Toggle Critical preview (C)">[C] Critical</button>`
      : '';
    const optPill = hasOpt
      ? `<button type="button" class="clash-toggle ${optActive ? 'active' : ''}" onclick="EventBus.emit('OnToggleOptionalBranch', {})" title="Hold Shift or click to preview optional spend">[Shift] ${esc(preview.optionalBranches[0].label)}</button>`
      : '';

    const pill = (k, v) => (typeof statPillHTML === 'function'
      ? statPillHTML(k, v, { showFullLabel: true, extraClass: 'stat-inline' })
      : `<b>${k.toUpperCase()} ${v}</b>`);

    const distText = initialDist === postBeforeDist
      ? `Dist ${postBeforeDist}`
      : `Dist ${initialDist}→${postBeforeDist}`;
    const distPart = `<span class="clash-detail-item clash-dist">${preview.usesEddie ? `Eddie→CPU Dist ${postBeforeDist}` : distText} · Rng ${esc(rangeText)}</span>`;

    const moveBits = [];
    if (preview.beforeMoveSummary) moveBits.push(`Before: ${preview.beforeMoveSummary}`);
    if (preview.oppHitMoveSummary) moveBits.push(`Hit: ${preview.oppHitMoveSummary}`);
    if (preview.afterMoveSummary) moveBits.push(`After: ${preview.afterMoveSummary}`);
    const movePart = moveBits.length
      ? `<span class="clash-detail-item clash-move">${esc(moveBits.join(' · '))}</span>`
      : '';

    const extraEffects = (preview.effectsSummary || []).filter((e) => !/^You [+-]\d+ HP$/.test(e) && !e.startsWith('Ignores '));
    const effectsPart = extraEffects.length
      ? `<span class="clash-detail-item clash-fx">${esc(extraEffects.slice(0, 3).join(' · '))}</span>`
      : '';

    let lifeHtml = '';
    if (preview.hasStochasticVariance) {
      lifeHtml = '<span class="clash-dmg">Proj. DMG: <b>?</b></span>';
    } else if (preview.willWhiff) {
      lifeHtml = `<span class="clash-dmg">CPU HP: <b>${oppLifeBefore}</b> <em class="clash-life-miss">(0 dmg)</em></span>`;
    } else {
      lifeHtml = `<span class="clash-dmg" title="${esc(preview.damageFormula || '')}">CPU HP: <b>${oppLifeBefore}→${oppLifeAfter}</b> <em class="clash-life-loss${preview.isPublicStateLethal ? ' lethal' : ''}">(-${oppLifeLoss})</em></span>`;
    }
    const selfLifeHtml = preview.selfLifeDelta
      ? `<span class="clash-self-hp ${preview.selfLifeDelta > 0 ? 'heal' : 'dmg'}">You ${preview.selfLifeDelta > 0 ? '+' : ''}${preview.selfLifeDelta} HP</span>`
      : '';
    const guardBreakHtml = (preview.breaksVisibleGuard && oppGrdVal > 0)
      ? '<span class="clash-pill guard-break">Breaks GRD</span>'
      : '';

    const hasDetailRow = !preview.hasStochasticVariance || moveBits.length > 0 || canPreviewCrit || hasOpt;
    const detailRow = hasDetailRow
      ? `<div class="clash-detail-row">
          <div class="clash-detail-left">${!preview.hasStochasticVariance ? distPart : ''}${movePart}${effectsPart}</div>
          ${(critToggle || optPill) ? `<div class="clash-detail-right">${critToggle}${optPill}</div>` : ''}
        </div>`
      : '';

    slot.innerHTML = `
      <div class="clash-banner${preview.willWhiff ? ' is-miss' : (preview.isPublicStateLethal ? ' is-lethal' : '')}">
        <div class="clash-top-row">
          <div class="clash-side you">
            <span class="clash-badge ${isInitiator ? 'striker' : 'defender'}">${isInitiator ? 'STRIKER' : 'DEFENDER'}</span>
            ${preview.cardName ? `<span class="clash-card-name">${esc(preview.cardName)}</span>` : ''}
            ${exPill}${critPill}${verdictBadge}
            <span class="clash-stats">
              ${pill('rng', rangeText)} ${pill('spd', spdVal)} ${pill('pow', powVal)} ${pill('arm', armVal)} ${pill('grd', grdVal)}
              ${s.ignoreArmor ? '<em class="tag-ignore">Ignores ARM</em>' : ''}
              ${s.ignoreGuard ? '<em class="tag-ignore">Ignores GRD</em>' : ''}
            </span>
          </div>
          <div class="clash-side opp">
            <span class="clash-stats"><span class="clash-opp-lbl">OPP:</span> ${pill('arm', oppArmVal)} ${pill('grd', oppGrdVal)}${s.oppStunImmune ? ' · Stun Immune' : ''}${guardBreakHtml}</span>
            ${oppBoosts.length ? `<span class="clash-boosts">Boosts: ${esc(oppBoosts.join(', '))}</span>` : ''}
            ${lifeHtml}${selfLifeHtml}
          </div>
        </div>
        ${detailRow}
      </div>
    `;
    syncStripState(slot, true);
  }

  return { render, clear };
})();
