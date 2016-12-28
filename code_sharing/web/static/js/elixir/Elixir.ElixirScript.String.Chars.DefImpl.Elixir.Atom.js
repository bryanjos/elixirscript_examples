    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    import Elixir$ElixirScript$Atom from '../elixir/Elixir.ElixirScript.Atom';
    const to_string = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([null],function()    {
        return     '';
      }),Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(atom)    {
        return     Elixir$ElixirScript$Atom.to_string(atom);
      }));
    export default {
        'Type': Symbol,     'Implementation': {
        to_string
  }
  };