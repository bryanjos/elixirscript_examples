    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    const global = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([],function()    {
        return     Elixir.Core.Functions.call_property(Elixir.Core.Functions,'get_global');
      }));
    const is_generator = Elixir.Core.Patterns.defmatch(Elixir.Core.Patterns.clause([Elixir.Core.Patterns.variable()],function(term)    {
        return     Elixir.Core.Functions.call_property(Elixir.Core.Functions.call_property(term,'constructor'),'name') === 'GeneratorFunction';
      }));
    export default {
        global,     is_generator
  };