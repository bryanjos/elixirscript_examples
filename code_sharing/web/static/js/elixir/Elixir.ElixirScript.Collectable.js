    import Elixir from '../elixir/Elixir.Bootstrap';
    import Elixir$ElixirScript$Kernel from '../elixir/Elixir.ElixirScript.Kernel';
    import Implementations from '../elixir/Elixir.ElixirScript.Collectable.Defimpl';
    const Elixir$ElixirScript$Collectable = Elixir.Core.Functions.defprotocol({
        into: function()    {
        
      }
  });
    for(let {Type,Implementation} of Implementations) Elixir.Core.Functions.defimpl(Elixir$ElixirScript$Collectable,Type,Implementation)
    export default Elixir$ElixirScript$Collectable;