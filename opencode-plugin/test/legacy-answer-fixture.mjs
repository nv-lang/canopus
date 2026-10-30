// Explicit legacy interrupt/mail dependency for historical queue/loop regression fixtures.
// Production index.ts always uses form reply; never discover or contact the owner's service in these tests.
export async function legacyAnswerPass(oa, core, ctx) {
  await oa.answerTick({
    call: (s) => core.questionCall(s),
    interrupt: async (sessionID) => {
      await ctx.session.interrupt({ sessionID })
      return { ok: true }
    },
    letter: (to, text, id) => core.postLetter(to, { id, from_role: core.PLUGIN_SENDER, from_session: core.PLUGIN_SENDER, to, time: Date.now(), text }),
    history: () => {},
    say: () => {},
  })
}
