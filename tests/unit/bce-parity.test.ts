// tests/unit/bce-parity.test.ts
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { runPipeline } from '@swoofer/promptweave';
import type { Agent } from '@swoofer/promptweave/types';

const BCE_DIR = resolve(import.meta.dirname, '../..');

function buildPreset(preset: string, launchParams: Record<string, Record<string, unknown>> = {}) {
  const agent: Agent = { name: `test-${preset}`, preset, add: [], remove: [], params: {} };
  return runPipeline(agent, BCE_DIR, launchParams);
}

describe('Parity: BCE presets produce complete prompts', () => {

  describe('Raid', () => {
    it('contains bug hunting instructions', () => {
      const result = buildPreset('raid');
      expect(result.output.prompt).toContain('bugs');
      expect(result.output.prompt).toContain('announce_work');
      expect(result.output.prompt).toContain('edge case');
    });

    it('has correct MCP tools', () => {
      const result = buildPreset('raid');
      expect(result.output.mcpTools).toContain('announce_work');
      expect(result.output.mcpTools).toContain('propose_resolution');
      expect(result.output.mcpTools).toContain('log_action_summary');
    });

    it('has worktree isolation hooks', () => {
      const result = buildPreset('raid');
      expect(result.output.hooks['session-start']).toBeDefined();
      expect(result.output.hooks['session-stop']).toBeDefined();
    });
  });

  describe('Melee', () => {
    it('contains test writing instructions', () => {
      const result = buildPreset('melee');
      expect(result.output.prompt).toContain('tests');
      expect(result.output.prompt).toContain('announce_work');
      expect(result.output.prompt).toContain('Phase Discovery');
    });
  });

  describe('Swarm', () => {
    it('contains refactoring instructions', () => {
      const result = buildPreset('swarm');
      expect(result.output.prompt).toContain('refactoring');
      expect(result.output.prompt).toContain('Phase Discovery');
    });
  });

  describe('Gardien', () => {
    it('contains quality audit categories', () => {
      const result = buildPreset('gardien');
      expect(result.output.prompt).toContain('Structure');
      expect(result.output.prompt).toContain('Conventions');
      expect(result.output.prompt).toContain('ComplexitÃ©');
      expect(result.output.prompt).toContain('Dette technique');
      expect(result.output.prompt).toContain('Tests');
      expect(result.output.prompt).toContain('Documentation');
    });

    it('has read-only mode', () => {
      const result = buildPreset('gardien');
      expect(result.output.prompt).toContain('lecture seule');
    });

    it('uses announce-readonly-adaptation rule', () => {
      const result = buildPreset('gardien');
      expect(result.compositionRulesApplied).toContain('announce-readonly-adaptation');
      expect(result.output.prompt).toContain('analyse'); // not "modifier du code"
    });
  });

  describe('Chaine', () => {
    it('implement preset has implementation instructions', () => {
      const result = buildPreset('chaine-implement');
      expect(result.output.prompt).toContain('ImplÃ©menteur');
      expect(result.output.prompt).toContain('amÃ©lioration');
    });

    it('review preset has review instructions + read-only', () => {
      const result = buildPreset('chaine-review');
      expect(result.output.prompt).toContain('Reviewer');
      expect(result.output.prompt).toContain('lecture seule');
    });

    it('test preset has testing instructions', () => {
      const result = buildPreset('chaine-test');
      expect(result.output.prompt).toContain('Testeur');
      expect(result.output.prompt).toContain('tests');
    });

    it('test preset uses sequential-then-announce rule', () => {
      const test = buildPreset('chaine-test');
      expect(test.compositionRulesApplied).toContain('sequential-then-announce');
    });
  });

  describe('Relais', () => {
    it('runner 1 has cleanup focus', () => {
      const result = buildPreset('relais-1');
      expect(result.output.prompt).toContain('Nettoyage');
    });

    it('runner 2 has architecture focus + waits for predecessor', () => {
      const result = buildPreset('relais-2');
      expect(result.output.prompt).toContain('architecturale');
      expect(result.output.prompt).toContain('SÃ©quencement');
    });

    it('runner 3 has finalization focus + waits for predecessor', () => {
      const result = buildPreset('relais-3');
      expect(result.output.prompt).toContain('Finition');
      expect(result.output.prompt).toContain('SÃ©quencement');
    });
  });

  describe('Revue', () => {
    it('author preset has improvement instructions', () => {
      const result = buildPreset('revue-author');
      expect(result.output.prompt).toContain('Auteur');
      expect(result.output.prompt).toContain('amÃ©liore');
    });

    it('reviewer preset has review instructions', () => {
      const result = buildPreset('revue-reviewer');
      expect(result.output.prompt).toContain('Reviewer');
      expect(result.output.prompt).toContain('approve_resolution');
    });
  });

  describe('Maitre', () => {
    it('lead preset has distribution instructions', () => {
      const result = buildPreset('maitre-lead');
      expect(result.output.prompt).toContain('Tech Lead');
      expect(result.output.prompt).toContain('distribu');
    });

    it('worker preset has execution instructions', () => {
      const result = buildPreset('maitre-worker');
      expect(result.output.prompt).toContain('Worker');
      expect(result.output.prompt).toContain('instructions');
    });
  });

  describe('Debat', () => {
    it('contains debate instructions', () => {
      const result = buildPreset('debat');
      expect(result.output.prompt).toContain('DÃ©bat');
      expect(result.output.prompt).toContain('position');
      expect(result.output.prompt).toContain('consensus');
    });
  });

  describe('Babel', () => {
    it('translator has translation instructions', () => {
      const result = buildPreset('babel-translator');
      expect(result.output.prompt).toContain('Tradui');
      expect(result.output.prompt).toContain('Markdown');
    });

    it('reviewer has review instructions', () => {
      const result = buildPreset('babel-reviewer');
      expect(result.output.prompt).toContain('RÃ©vis');
      expect(result.output.prompt).toContain('FidÃ©litÃ©');
    });
  });

  describe('Arene', () => {
    it('quizmaster has quiz instructions', () => {
      const result = buildPreset('arene-quizmaster');
      expect(result.output.prompt).toContain('Quizmaster');
      expect(result.output.prompt).toContain('question');
    });

    it('player has competition instructions', () => {
      const result = buildPreset('arene-player');
      expect(result.output.prompt).toContain('compÃ©tition');
    });
  });

  describe('Carrefour', () => {
    it('contains conflict test instructions', () => {
      const result = buildPreset('carrefour');
      expect(result.output.prompt).toContain('MÃŠMES fichiers');
      expect(result.output.prompt).toContain('conflit');
    });
  });

  describe('Solo mode', () => {
    it('strips coordination from any preset', () => {
      const result = buildPreset('raid', { 'coordinator-rules': { solo_mode: true } });
      expect(result.compositionRulesApplied).toContain('solo-mode-strip');
      expect(result.output.prompt).toContain('seul');
      expect(result.behaviors.some(b => b.name === 'announce-before-write')).toBe(false);
      expect(result.behaviors.some(b => b.name === 'conflict-resolution')).toBe(false);
      expect(result.behaviors.some(b => b.name === 'liaison-spawn')).toBe(false);
    });
  });
});

