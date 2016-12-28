    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    const to_string = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(tuple)    {
        return     Elixir.Core.Functions.call_property(tuple,'toString');
      }));
    export default {
        'Type': Elixir.Core.Tuple,     'Implementation': {
        to_string
  }
  };