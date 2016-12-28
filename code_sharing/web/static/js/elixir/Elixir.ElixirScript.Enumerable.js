    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    import Implementations from '../elixir/Elixir.ElixirScript.Enumerable.Defimpl';
    const Elixir$ElixirScript$Enumerable = Elixir.Core.Functions.defprotocol({
        reduce: function()    {
        
      },     member__qmark__: function()    {
        
      },     count: function()    {
        
      }
  });
    for(let {Type,Implementation} of Implementations) Elixir.Core.Functions.defimpl(Elixir$ElixirScript$Enumerable,Type,Implementation)
    export default Elixir$ElixirScript$Enumerable;