    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    const to_string = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(float)    {
        return     Elixir.Core.Functions.call_property(float,'toString');
      }));
    export default {
        'Type': Elixir.Core.Float,     'Implementation': {
        to_string
  }
  };