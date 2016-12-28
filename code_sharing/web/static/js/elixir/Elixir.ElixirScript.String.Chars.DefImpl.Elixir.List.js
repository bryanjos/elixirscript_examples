    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    const to_string = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(list)    {
        return     Elixir.Core.Functions.call_property(list,'toString');
      }));
    export default {
        'Type': Array,     'Implementation': {
        to_string
  }
  };