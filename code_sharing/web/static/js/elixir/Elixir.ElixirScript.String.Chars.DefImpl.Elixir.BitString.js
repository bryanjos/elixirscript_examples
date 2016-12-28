    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    const to_string = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(thing)    {
        return     thing;
      },function(thing)    {
        return     Elixir$ElixirScript$Kernel.is_binary(thing);
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(thing)    {
        return     Elixir.Core.Functions.call_property(thing,'toString');
      }));
    export default {
        'Type': Elixir.Core.BitString,     'Implementation': {
        to_string
  }
  };